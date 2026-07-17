import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { runGates as realRunGates } from "@aker-build/gates";
import { MissingProjectMapError } from "@aker-build/gates";
import type { RunGatesResult } from "@aker-build/gates";
import {
  prChangedFiles as realPrChangedFiles,
  prMetadata as realPrMetadata,
  type GitHubPrMetadata,
} from "./gh.js";
import { diffAttributableFindings } from "./attribute.js";
import { checkScope, SCOPE_SKIPPED } from "./scope.js";
import { loadQueueItem } from "./io.js";
import { applyConfigPathFilter, assemble, excludeOutDir } from "./review.js";
import { assembleIncompleteReview, compareReview } from "./compare-review.js";
import { diffTrees } from "./diff.js";
import { createRefSnapshots } from "./snapshot.js";
import type { AnyReviewReport, ReviewReport, ReviewOptions, ScopeResult, PrMetadata } from "./types.js";

/**
 * Injectable PR dependencies. The normal v2 path resolves exact GitHub base/head OIDs and uses the
 * shared snapshot comparison engine; changed-file and injected-gate seams remain only for frozen v1
 * migration tests.
 */
export interface PrReviewDeps {
  prChangedFiles?: (prNumber: number) => string[];
  prMetadata?: (prNumber: number) => { title: string; state: string; baseRefName: string; baseRefOid?: string; headRefOid?: string };
  runGates?: (repoRoot: string, opts: { out: string; configPath?: string }) => RunGatesResult;
  /** Repo root the gates run over (the checked-out PR / current repo). */
  repoRoot?: string;
}

const DEFAULT_OUT = ".aker-build";

/**
 * Review a GitHub PR by number. The normal v2 path resolves exact base/head OIDs through `gh`,
 * archives both local objects, derives changed ranges locally, and analyzes both snapshots. It is
 * read-only and does not use GitHub patch text for correctness. Missing GitHub access still
 * propagates as `GitHubUnavailableError` so callers can report the gap without disabling local mode.
 */
export function reviewPr(prNumber: number, opts: ReviewOptions = {}, deps: PrReviewDeps = {}): AnyReviewReport {
  if (deps.prChangedFiles || deps.runGates) return reviewPrV1(prNumber, opts, deps);

  const out = opts.out ?? DEFAULT_OUT;
  const repoRoot = deps.repoRoot ?? ".";
  const mapPath = resolve(out, "project-map.json");
  if (!existsSync(mapPath)) {
    throw new MissingProjectMapError(`No produced map at ${mapPath}. Run \`aker-build scan\` first.`);
  }
  const rawMeta = (deps.prMetadata ?? realPrMetadata)(prNumber);
  if (!hasExactOids(rawMeta)) {
    throw new Error("PR metadata did not include exact base/head commit OIDs.");
  }
  const meta: GitHubPrMetadata = rawMeta;
  const prMeta: PrMetadata = {
    number: prNumber,
    title: meta.title,
    state: meta.state,
    base_ref: meta.baseRefName,
  };
  const snapshots = createRefSnapshots(repoRoot, meta.baseRefOid, meta.headRefOid);
  try {
    if (!snapshots.complete) {
      const scope = scopeForChangedFiles([], out, opts.item);
      return assembleIncompleteReview({
        mode: "pr",
        base: snapshots.base,
        head: snapshots.head,
        scope,
        githubAvailable: true,
        incompleteReasons: snapshots.incompleteReasons,
        pr: prMeta,
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
    const scope = scopeForChangedFiles(filteredDiff.changedFiles.map((file) => file.path), out, opts.item);
    return compareReview({
      mode: "pr",
      baseRoot: snapshots.baseRoot,
      headRoot: snapshots.headRoot,
      base: snapshots.base,
      head: snapshots.head,
      scope,
      githubAvailable: true,
      pr: prMeta,
      configPath: opts.configPath,
    }, { diff: () => filteredDiff });
  } finally {
    snapshots.dispose();
  }
}

function reviewPrV1(prNumber: number, opts: ReviewOptions, deps: PrReviewDeps): ReviewReport {
  const out = opts.out ?? DEFAULT_OUT;
  const repoRoot = deps.repoRoot ?? ".";
  const getChanged = deps.prChangedFiles ?? realPrChangedFiles;
  const getMetadata = deps.prMetadata ?? realPrMetadata;
  const getGates = deps.runGates ?? ((root: string, o: { out: string; configPath?: string }) => realRunGates(root, o));

  const changed = getChanged(prNumber); // may throw GitHubUnavailableError (propagated)
  const scopedChanged = applyConfigPathFilter(changed, repoRoot, opts.configPath);
  const meta = getMetadata(prNumber); // may throw GitHubUnavailableError (propagated)
  const prMeta: PrMetadata = {
    number: prNumber,
    title: meta.title,
    state: meta.state,
    base_ref: meta.baseRefName,
  };

  const { risks } = getGates(repoRoot, { out, configPath: opts.configPath });
  const attributable = diffAttributableFindings(risks.findings, scopedChanged);

  const scope: ScopeResult = opts.item
    ? checkScope(scopedChanged, loadQueueItem(out, opts.item))
    : SCOPE_SKIPPED;

  return assemble({ mode: "pr", changed, attributable, scope, githubAvailable: true, prMeta });
}

function hasExactOids(
  metadata: ReturnType<NonNullable<PrReviewDeps["prMetadata"]>>,
): metadata is GitHubPrMetadata {
  const oid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
  return typeof metadata.baseRefOid === "string"
    && oid.test(metadata.baseRefOid)
    && typeof metadata.headRefOid === "string"
    && oid.test(metadata.headRefOid);
}

function scopeForChangedFiles(changed: string[], out: string, item?: string): ScopeResult {
  return item ? checkScope(changed, loadQueueItem(out, item)) : SCOPE_SKIPPED;
}
