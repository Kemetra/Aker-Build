import { reviewPr, GitHubUnavailableError, type ReviewReport, type PrReviewDeps } from "@tenantguard/review";
import type { PullRequestEvent } from "./types.js";

/** The gates runner shape `reviewPr` accepts (injectable for the runner↔engine seam). */
type RunGatesFn = NonNullable<PrReviewDeps["runGates"]>;

/**
 * Raised when scanning the checkout (`prepareRepo`) fails. Its message is FIXED and path-free — the
 * underlying scan error embeds an absolute tmp/checkout path, which `safeRun` would otherwise forward
 * into the public Checks summary. `safeRun` maps this to a neutral conclusion like any incompleteness.
 */
export class PrepareRepoError extends Error {
  constructor() {
    super("could not prepare the checkout for review");
    this.name = "PrepareRepoError";
  }
}

/**
 * Provides an ephemeral, per-event working tree checked out at the PR head SHA, and disposes of it
 * afterward. This is the linchpin of statelessness (FR-008): the gates read the FILESYSTEM (see
 * `reviewPr`'s contract — it runs over `repoRoot`), so the App must check out the head, run, and
 * DELETE the workdir. No source is persisted across events.
 */
export interface Workspace {
  /** Check out `headSha` into a fresh dir and return its absolute path. */
  checkout(args: { owner: string; repo: string; headSha: string }): Promise<string>;
  /** Remove the checked-out dir (always called, even on failure). */
  dispose(repoRoot: string): Promise<void>;
}

/** Octokit-backed sources the App injects in place of review's default `gh`/git sources. */
export interface RunnerDeps {
  workspace: Workspace;
  prChangedFiles: (prNumber: number) => string[];
  prMetadata: (prNumber: number) => { title: string; state: string; baseRefName: string };
  /** Optional gates-runner override. Defaults to review's real `runGates` over the checkout. */
  runGates?: RunGatesFn;
  /**
   * Prepare the freshly-checked-out repo so the gates can run: the runtime SCANS the checkout and
   * produces its project-map BEFORE `runGates` reads it, returning the ABSOLUTE out-dir holding that
   * map. Without this the gates resolve `project-map.json` from cwd (not the checkout) and every real
   * review degrades to neutral. Optional so fake-injected `runGates` tests need not produce a map.
   */
  prepareRepo?: (repoRoot: string) => string;
}

/**
 * Run the existing `review-pr` chain for one PR event against an ephemeral checkout, returning a
 * ReviewReport. The verdict/findings are produced entirely by the shared engine — the App does not
 * re-judge (FR-013). The workspace is always disposed (no stored source). The caller maps the
 * report to a Checks payload.
 *
 * Throws nothing for the GitHub-unavailable case is NOT the contract here — callers that want a
 * neutral conclusion on a failed/incomplete review should use `safeRun` below.
 */
export async function run(event: PullRequestEvent, deps: RunnerDeps): Promise<ReviewReport> {
  const repoRoot = await deps.workspace.checkout({
    owner: event.owner,
    repo: event.repo,
    headSha: event.headSha,
  });
  try {
    // Scan the checkout to produce its project-map and learn the absolute out-dir the gates must
    // read. Threaded into `reviewPr` as `opts.out` so resolution stays inside the checkout (never
    // cwd). When omitted (fake-injected `runGates` tests), `reviewPr` uses its relative default.
    // A scan failure is re-thrown as a FIXED, path-free message: the original would embed an absolute
    // tmp/checkout path that `safeRun` forwards into the public Checks summary (info disclosure).
    let out: string | undefined;
    if (deps.prepareRepo) {
      try {
        out = deps.prepareRepo(repoRoot);
      } catch {
        throw new PrepareRepoError();
      }
    }
    return reviewPr(
      event.prNumber,
      out ? { out } : {},
      {
        repoRoot,
        prChangedFiles: deps.prChangedFiles,
        prMetadata: deps.prMetadata,
        ...(deps.runGates ? { runGates: deps.runGates } : {}),
      } satisfies PrReviewDeps,
    );
  } finally {
    await deps.workspace.dispose(repoRoot);
  }
}

/** Outcome of a guarded run: either a real report, or an incomplete signal that maps to neutral. */
export type RunOutcome =
  | { ok: true; report: ReviewReport }
  | { ok: false; reason: string };

/**
 * Run, but convert any incompleteness (GitHub unavailable, reduced fork perms, checkout/timeout
 * failure) into an honest `{ ok: false, reason }` instead of throwing — so the App concludes
 * `neutral` with a message and NEVER a false `success` (FR-011). The workspace is still disposed.
 */
export async function safeRun(event: PullRequestEvent, deps: RunnerDeps): Promise<RunOutcome> {
  try {
    const report = await run(event, deps);
    return { ok: true, report };
  } catch (err) {
    if (err instanceof GitHubUnavailableError) {
      return { ok: false, reason: `GitHub access unavailable: ${err.message}` };
    }
    return { ok: false, reason: err instanceof Error ? err.message : "review could not complete" };
  }
}
