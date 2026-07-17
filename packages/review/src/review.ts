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
import { createLocalSnapshots } from "./snapshot.js";
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

/**
 * Review the current local diff. The normal v2 path archives the resolved base plus a conservative
 * working-tree overlay, derives zero-context changed ranges locally, analyzes both snapshots, and
 * derives a comparison verdict. Frozen injected dependencies retain the v1 test/migration seam.
 */
export function reviewLocalDiff(opts: ReviewOptions = {}, deps: ReviewDeps = {}): AnyReviewReport {
  // Retain the frozen v1 injection seam for downstream tests/consumers during migration. The real
  // production path below is the sole v2 producer and does not use filename-only attribution.
  if (deps.changedFiles || deps.runGates) return reviewLocalDiffV1(opts, deps);

  const out = opts.out ?? DEFAULT_OUT;
  const repoRoot = deps.repoRoot ?? ".";
  const mapPath = resolve(out, "project-map.json");
  if (!existsSync(mapPath)) {
    throw new MissingProjectMapError(`No produced map at ${mapPath}. Run \`aker-build scan\` first.`);
  }

  const snapshots = createLocalSnapshots(repoRoot, opts.base ?? "HEAD");
  try {
    if (!snapshots.complete) {
      if (opts.base && snapshots.incompleteReasons.includes("base_unavailable")) {
        throw new GitUnavailableError("Unable to resolve the requested base ref.");
      }
      const changed = safeVisibleChangedFiles(repoRoot, opts.base ?? "HEAD", out, opts.configPath);
      const scope = scopeForChangedFiles(changed, out, opts.item);
      return assembleIncompleteReview({
        mode: "local-diff",
        base: snapshots.base,
        head: snapshots.head,
        scope,
        githubAvailable: null,
        incompleteReasons: snapshots.incompleteReasons,
        changedFiles: changed,
      });
    }

    const rawDiff = diffTrees(snapshots.baseRoot, snapshots.headRoot);
    const visiblePaths = new Set(applyConfigPathFilter(
      excludeOutDir(rawDiff.changedFiles.map((file) => file.path), repoRoot, out),
      repoRoot,
      opts.configPath,
    ));
    const filteredDiff = {
      ...rawDiff,
      changedFiles: rawDiff.changedFiles.filter((file) => visiblePaths.has(file.path)),
    };
    const changed = filteredDiff.changedFiles.map((file) => file.path);
    const scope = scopeForChangedFiles(changed, out, opts.item);
    return compareReview({
      mode: "local-diff",
      baseRoot: snapshots.baseRoot,
      headRoot: snapshots.headRoot,
      base: snapshots.base,
      head: snapshots.head,
      scope,
      githubAvailable: null,
      configPath: opts.configPath,
    }, { diff: () => filteredDiff });
  } finally {
    snapshots.dispose();
  }
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

  return assemble("local-diff", changed, attributable, scope, null);
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

/** Assemble the final report from the parts. Findings ordered deterministically (code-unit). */
export function assemble(
  mode: ReviewReport["mode"],
  changed: string[],
  attributable: readonly AttributableFinding[],
  scope: ScopeResult,
  githubAvailable: boolean | null,
  prMeta?: PrMetadata,
): ReviewReport {
  // Code-unit sort (not localeCompare) so re-runs over the same set are byte-identical (SC-007),
  // independent of the order findings arrive in.
  const gateFindings: ReviewFinding[] = [...attributable]
    .sort((a, b) => {
      const ka = gateSortKey(a);
      const kb = gateSortKey(b);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    })
    .map((f) => ({ ...f }));
  const scopeFindings: ReviewFinding[] = scope.violations.map((v) => ({
    kind: "scope" as const,
    file: v.file,
    reason: v.reason,
    item_id: scope.item_id ?? "",
  }));
  const findings = [...gateFindings, ...scopeFindings];

  return {
    schema_version: 1,
    mode,
    verdict: decideVerdict(attributable, scope),
    changed_files: [...changed],
    findings,
    scope,
    github_available: githubAvailable,
    ...(prMeta ? { pr: prMeta } : {}),
  };
}
