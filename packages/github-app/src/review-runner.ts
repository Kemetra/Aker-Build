import {
  assembleIncompleteReview,
  compareReview,
  createCheckoutSnapshots,
  reviewPr,
  GitHubUnavailableError,
  type AnyReviewReport,
  type PrReviewDeps,
} from "@aker-build/review";
import type { PullRequestEvent } from "./types.js";

/** The gates runner shape `reviewPr` accepts (injectable for the runner↔engine seam). */
type RunGatesFn = NonNullable<PrReviewDeps["runGates"]>;

/**
 * Raised when the legacy v1 injection path's `prepareRepo` scan fails. Its message is FIXED and
 * path-free — the underlying scan error embeds an absolute temporary checkout path, which `safeRun`
 * would otherwise forward into the public Checks summary. `safeRun` maps this to neutral.
 */
export class PrepareRepoError extends Error {
  constructor() {
    super("could not prepare the checkout for review");
    this.name = "PrepareRepoError";
  }
}

export type IncompleteReason =
  | "github_unavailable"
  | "github_metadata_unavailable"
  | "review_incomplete"
  | "scan_budget_exceeded"
  | "worker_timeout"
  | "worker_crashed"
  | "shutdown";

export class IncompleteReviewError extends Error {
  constructor(public readonly reason: IncompleteReason) {
    super(reason);
    this.name = "IncompleteReviewError";
  }
}

/**
 * Provides an ephemeral working tree at one validated commit SHA. Production v2 calls it twice per
 * event (base then head) and disposes both. No source is persisted across events.
 */
export interface Workspace {
  /** Check out `headSha` into a fresh dir and return its absolute path. */
  checkout(args: { owner: string; repo: string; headSha: string }): Promise<string>;
  /** Remove the checked-out dir (always called, even on failure). */
  dispose(repoRoot: string): Promise<void>;
}

/** Runtime dependencies plus frozen v1 injection seams retained only for migration tests. */
export interface RunnerDeps {
  workspace: Workspace;
  /** Legacy v1 seam only. Production v2 derives changed lines from the two managed checkouts. */
  prChangedFiles?: (prNumber: number) => string[];
  prMetadata?: (prNumber: number) => { title: string; state: string; baseRefName: string };
  /** Optional gates-runner override. Defaults to review's real `runGates` over the checkout. */
  runGates?: RunGatesFn;
  /**
   * Legacy v1 seam: prepare the one checked-out repo so injected gates can run. Production v2 scans
   * the archived base/head snapshots through the shared comparison engine. Optional so fake-injected
   * `runGates` tests need not produce a project map.
   */
  prepareRepo?: (repoRoot: string) => string;
}

/**
 * Compare distinct base/head managed checkouts through the shared v2 engine. The App does not
 * re-judge findings; both checkouts and the derived archive pair are disposed on every path.
 *
 * Throws nothing for the GitHub-unavailable case is NOT the contract here — callers that want a
 * neutral conclusion on a failed/incomplete review should use `safeRun` below.
 */
export async function run(event: PullRequestEvent, deps: RunnerDeps): Promise<AnyReviewReport> {
  if (deps.runGates || deps.prChangedFiles) return runLegacy(event, deps);

  let baseRepoRoot: string | null = null;
  let headRepoRoot: string | null = null;
  let snapshots: ReturnType<typeof createCheckoutSnapshots> | null = null;
  try {
    baseRepoRoot = await deps.workspace.checkout({
      owner: event.owner,
      repo: event.repo,
      headSha: event.baseSha,
    });
    headRepoRoot = await deps.workspace.checkout({
      owner: event.owner,
      repo: event.repo,
      headSha: event.headSha,
    });
    snapshots = createCheckoutSnapshots({
      baseRepoRoot,
      headRepoRoot,
      expectedBaseSha: event.baseSha,
      expectedHeadSha: event.headSha,
    });
    const metadata = deps.prMetadata?.(event.prNumber) ?? {
      title: `Pull request #${event.prNumber}`,
      state: "unknown",
      baseRefName: event.baseSha,
    };
    const pr = {
      number: event.prNumber,
      title: metadata.title,
      state: metadata.state,
      base_ref: metadata.baseRefName,
    };
    const scope = { checked: false as const, violations: [] };
    if (!snapshots.complete) {
      return assembleIncompleteReview({
        mode: "pr",
        base: snapshots.base,
        head: snapshots.head,
        scope,
        githubAvailable: true,
        incompleteReasons: snapshots.incompleteReasons,
        pr,
      });
    }
    return compareReview({
      mode: "pr",
      baseRoot: snapshots.baseRoot,
      headRoot: snapshots.headRoot,
      base: snapshots.base,
      head: snapshots.head,
      scope,
      githubAvailable: true,
      pr,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "ScanBudgetExceededError") {
      throw new IncompleteReviewError("scan_budget_exceeded");
    }
    throw error;
  } finally {
    let cleanupFailed = false;
    if (snapshots) {
      try {
        snapshots.dispose();
      } catch {
        cleanupFailed = true;
      }
    }
    for (const repoRoot of [headRepoRoot, baseRepoRoot]) {
      if (!repoRoot) continue;
      try {
        await deps.workspace.dispose(repoRoot);
      } catch {
        cleanupFailed = true;
      }
    }
    if (cleanupFailed) throw new IncompleteReviewError("review_incomplete");
  }
}

async function runLegacy(event: PullRequestEvent, deps: RunnerDeps): Promise<AnyReviewReport> {
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
      } catch (error) {
        if (error instanceof Error && error.name === "ScanBudgetExceededError") {
          throw new IncompleteReviewError("scan_budget_exceeded");
        }
        throw new PrepareRepoError();
      }
    }
    return reviewPr(
      event.prNumber,
      out ? { out } : {},
      {
        repoRoot,
        ...(deps.prChangedFiles ? { prChangedFiles: deps.prChangedFiles } : {}),
        ...(deps.prMetadata ? { prMetadata: deps.prMetadata } : {}),
        ...(deps.runGates ? { runGates: deps.runGates } : {}),
      } satisfies PrReviewDeps,
    );
  } finally {
    await deps.workspace.dispose(repoRoot);
  }
}

/** Outcome of a guarded run: either a real report, or an incomplete signal that maps to neutral. */
export type RunOutcome =
  | { ok: true; report: AnyReviewReport }
  | { ok: false; reason: IncompleteReason };

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
      return { ok: false, reason: "github_unavailable" };
    }
    if (err instanceof IncompleteReviewError) return { ok: false, reason: err.reason };
    return { ok: false, reason: "review_incomplete" };
  }
}
