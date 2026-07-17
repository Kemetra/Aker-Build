import { existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { filterPaths, loadConfig } from "@aker-build/config";
import { MissingProjectMapError, runGates as realRunGates } from "@aker-build/gates";
import type { RunGatesResult } from "@aker-build/gates";
import { changedFiles as realChangedFiles } from "./git.js";
import { GitUnavailableError } from "./git.js";
import { diffAttributableFindings, type AttributableFinding } from "./attribute.js";
import { checkScope, SCOPE_SKIPPED } from "./scope.js";
import { decideVerdict } from "./verdict.js";
import { loadQueueItem } from "./io.js";
import { compareReview, assembleIncompleteReview } from "./compare-review.js";
import { diffTrees } from "./diff.js";
import { createLocalSnapshots, type SnapshotPairFailure, type SnapshotPairSuccess } from "./snapshot.js";
import type {
  AnyReviewReport,
  ReviewReport,
  ReviewFinding,
  ReviewOptions,
  ScopeResult,
  PrMetadata,
} from "./types.js";

/**
 * Injectable dependencies (the codebase's context/deps idiom — cf. 004 GateContext, 005 RouterInputs).
 * Default to the real implementations so production always takes the real path; tests override to
 * supply synthetic findings/changed-files (R8 — unit-test the wiring without a full chain run).
 */
export interface ReviewDeps {
  changedFiles?: (repoRoot: string) => string[];
  runGates?: (repoRoot: string, opts: { out: string; configPath?: string }) => RunGatesResult;
  /** Repo root to review (defaults to the targetPath / cwd). */
  repoRoot?: string;
}

const DEFAULT_OUT = ".aker-build";

interface LocalReviewContext {
  options: ReviewOptions;
  out: string;
  repoRoot: string;
}

/**
 * Review the current local diff. The normal v2 path archives the resolved base plus a conservative
 * working-tree overlay, derives zero-context changed ranges locally, analyzes both snapshots, and
 * derives a comparison verdict. Frozen injected dependencies retain the v1 test/migration seam.
 */
export function reviewLocalDiff(opts: ReviewOptions = {}, deps: ReviewDeps = {}): AnyReviewReport {
  // Retain the frozen v1 injection seam for downstream tests/consumers during migration. The real
  // production path below is the sole v2 producer and does not use filename-only attribution.
  if (deps.changedFiles || deps.runGates) return reviewLocalDiffV1(opts, deps);

  const context = localReviewContext(opts, deps);
  assertProjectMapPresent(context.out);
  return reviewSnapshots(context);
}

function localReviewContext(options: ReviewOptions, deps: ReviewDeps): LocalReviewContext {
  return { options, out: options.out ?? DEFAULT_OUT, repoRoot: deps.repoRoot ?? "." };
}

function assertProjectMapPresent(out: string): void {
  const mapPath = resolve(out, "project-map.json");
  if (!existsSync(mapPath)) throw new MissingProjectMapError(`No produced map at ${mapPath}. Run \`aker-build scan\` first.`);
}

function reviewSnapshots(context: LocalReviewContext): AnyReviewReport {
  const snapshots = createLocalSnapshots(context.repoRoot, context.options.base ?? "HEAD");
  try {
    return snapshots.complete ? completeSnapshotReview(context, snapshots) : incompleteSnapshotReview(context, snapshots);
  } finally {
    snapshots.dispose();
  }
}

function incompleteSnapshotReview(context: LocalReviewContext, snapshots: SnapshotPairFailure): AnyReviewReport {
  if (context.options.base && snapshots.incompleteReasons.includes("base_unavailable")) {
    throw new GitUnavailableError("Unable to resolve the requested base ref.");
  }
  const changed = safeVisibleChangedFiles(
    context.repoRoot,
    context.options.base ?? "HEAD",
    context.out,
    context.options.configPath,
  );
  return assembleIncompleteReview({
    mode: "local-diff",
    base: snapshots.base,
    head: snapshots.head,
    scope: scopeForChangedFiles(changed, context.out, context.options.item),
    githubAvailable: null,
    incompleteReasons: snapshots.incompleteReasons,
    changedFiles: changed,
  });
}

function completeSnapshotReview(context: LocalReviewContext, snapshots: SnapshotPairSuccess): AnyReviewReport {
  const filteredDiff = visibleDiff(context, snapshots);
  const changed = filteredDiff.changedFiles.map((file) => file.path);
  return compareReview({
    mode: "local-diff",
    baseRoot: snapshots.baseRoot,
    headRoot: snapshots.headRoot,
    base: snapshots.base,
    head: snapshots.head,
    scope: scopeForChangedFiles(changed, context.out, context.options.item),
    githubAvailable: null,
    configPath: context.options.configPath,
  }, { diff: () => filteredDiff });
}

function visibleDiff(context: LocalReviewContext, snapshots: SnapshotPairSuccess): ReturnType<typeof diffTrees> {
  const diff = diffTrees(snapshots.baseRoot, snapshots.headRoot);
  const visiblePaths = new Set(applyConfigPathFilter(
    excludeOutDir(diff.changedFiles.map((file) => file.path), context.repoRoot, context.out),
    context.repoRoot,
    context.options.configPath,
  ));
  return { ...diff, changedFiles: diff.changedFiles.filter((file) => visiblePaths.has(file.path)) };
}

function reviewLocalDiffV1(opts: ReviewOptions, deps: ReviewDeps): ReviewReport {
  const out = opts.out ?? DEFAULT_OUT;
  const repoRoot = deps.repoRoot ?? ".";
  const getChanged = deps.changedFiles ?? realChangedFiles;
  const getGates = deps.runGates ?? ((root: string, o: { out: string; configPath?: string }) => realRunGates(root, o));

  // Exclude the reviewer's own out-dir from the changed files: it holds review.json/review.md and
  // upstream artifacts (project-map/queue), which are not source changes. Otherwise run 2's diff
  // would include run 1's output — a self-referential SC-007 determinism break — and a scope check
  // would falsely flag them. Resolved relative to repoRoot so an absolute --out outside the repo is
  // a no-op (git never reports those paths anyway).
  const changed = excludeOutDir(getChanged(repoRoot), repoRoot, out);
  const scopedChanged = applyConfigPathFilter(changed, repoRoot, opts.configPath);
  const { risks } = getGates(repoRoot, { out, configPath: opts.configPath });
  const attributable = diffAttributableFindings(risks.findings, scopedChanged);

  const scope: ScopeResult = opts.item
    ? checkScope(scopedChanged, loadQueueItem(out, opts.item))
    : SCOPE_SKIPPED;

  return assemble({ mode: "local-diff", changed, attributable, scope, githubAvailable: null });
}

function scopeForChangedFiles(changed: string[], out: string, item?: string): ScopeResult {
  return item ? checkScope(changed, loadQueueItem(out, item)) : SCOPE_SKIPPED;
}

function safeVisibleChangedFiles(repoRoot: string, base: string, out: string, configPath?: string): string[] {
  try {
    return applyConfigPathFilter(excludeOutDir(realChangedFiles(repoRoot, base), repoRoot, out), repoRoot, configPath);
  } catch {
    return [];
  }
}

export function applyConfigPathFilter(changed: string[], repoRoot: string, configPath?: string): string[] {
  const config = loadConfig(repoRoot, { configPath }).config;
  return filterPaths(changed, config);
}

/**
 * Drop changed files that live inside the reviewer's out-dir. The out-dir is resolved relative to
 * the repo; if it lies OUTSIDE the repo (e.g. an absolute --out elsewhere), nothing is filtered
 * (git would not report those repo-relative paths anyway). Uses path.relative rather than a string
 * prefix so `..`/path-boundary cases are handled correctly.
 */
export function excludeOutDir(changed: string[], repoRoot: string, out: string): string[] {
  const outAbs = isAbsolute(out) ? resolve(out) : resolve(repoRoot, out);
  const rel = relative(resolve(repoRoot), outAbs).split("\\").join("/");
  // out-dir is outside the repo (rel starts with ".." or is absolute) → nothing to filter.
  if (rel === "" || rel.startsWith("..") || isAbsolute(rel)) {
    return rel === "" ? changed.filter((f) => f !== "") : changed;
  }
  const prefix = rel.endsWith("/") ? rel : `${rel}/`;
  return changed.filter((f) => f !== rel && !f.startsWith(prefix));
}

/** Stable sort key for a gate finding (matches the 004 ordering: gate_id, path, signal, status). */
function gateSortKey(f: AttributableFinding): string {
  const first = f.evidence[0];
  return `${f.gate_id} ${first?.path ?? ""} ${first?.signal ?? ""} ${f.status}`;
}

export interface AssembleReviewInput {
  mode: ReviewReport["mode"];
  changed: string[];
  attributable: readonly AttributableFinding[];
  scope: ScopeResult;
  githubAvailable: boolean | null;
  prMeta?: PrMetadata;
}

/** Assemble the final report from the parts. Findings ordered deterministically (code-unit). */
export function assemble(input: AssembleReviewInput): ReviewReport {
  // Code-unit sort (not localeCompare) so re-runs over the same set are byte-identical (SC-007),
  // independent of the order findings arrive in.
  const gateFindings: ReviewFinding[] = [...input.attributable]
    .sort((a, b) => {
      const ka = gateSortKey(a);
      const kb = gateSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map((f) => ({ ...f }));
  const scopeFindings: ReviewFinding[] = input.scope.violations.map((v) => ({
    kind: "scope" as const,
    file: v.file,
    reason: v.reason,
    item_id: input.scope.item_id ?? "",
  }));
  const findings = [...gateFindings, ...scopeFindings];

  return {
    schema_version: 1,
    mode: input.mode,
    verdict: decideVerdict(input.attributable, input.scope),
    changed_files: [...input.changed],
    findings,
    scope: input.scope,
    github_available: input.githubAvailable,
    ...(input.prMeta ? { pr: input.prMeta } : {}),
  };
}
