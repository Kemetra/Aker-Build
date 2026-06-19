import { runGates as realRunGates } from "@tenantguard/gates";
import type { RunGatesResult } from "@tenantguard/gates";
import { prChangedFiles as realPrChangedFiles, prMetadata as realPrMetadata } from "./gh.js";
import { diffAttributableFindings } from "./attribute.js";
import { checkScope, SCOPE_SKIPPED } from "./scope.js";
import { loadQueueItem } from "./io.js";
import { applyConfigPathFilter, assemble } from "./review.js";
import type { ReviewReport, ReviewOptions, ScopeResult, PrMetadata } from "./types.js";

/**
 * Injectable dependencies for PR review (default-real). The PR path differs from local-diff ONLY in
 * the changed-files source (gh vs git); the attribute→scope→verdict core is shared via `assemble`.
 */
export interface PrReviewDeps {
  prChangedFiles?: (prNumber: number) => string[];
  prMetadata?: (prNumber: number) => { title: string; state: string; baseRefName: string };
  runGates?: (repoRoot: string, opts: { out: string; configPath?: string }) => RunGatesResult;
  /** Repo root the gates run over (the checked-out PR / current repo). */
  repoRoot?: string;
}

const DEFAULT_OUT = ".tenantguard";

/**
 * Review a GitHub PR by number (FR-005). Reuses the local-diff core over the PR's changed-files set,
 * and surfaces PR metadata (title/state/base) as evidence alongside the changed files. Propagates
 * `GitHubUnavailableError` from the gh source so the caller can report the gap and keep local-diff
 * available (FR-006). Read-only.
 *
 * v0 assumption: the gates run over the **current working tree** (`repoRoot`), so the PR branch must
 * be checked out locally for findings to attribute correctly to the PR's changed files. The changed-
 * files SET comes from GitHub; the code the gates inspect is the local checkout.
 */
export function reviewPr(prNumber: number, opts: ReviewOptions = {}, deps: PrReviewDeps = {}): ReviewReport {
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

  return assemble("pr", changed, attributable, scope, true, prMeta);
}
