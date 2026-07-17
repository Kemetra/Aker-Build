// Public surface for @aker-build/github-app.
// Report-only GitHub App (roadmap P4): on a PR event, run the review-pr chain at the head ref and
// post a Checks run + annotations. No repository mutation; stateless; secret-safe.

export { verifySignature, parseEvent, WebhookSignatureError } from "./webhook.js";
export { buildPayload, postCheck, type ChecksClient } from "./checks.js";
// incompletePayload is defined+exported below (used by handleEvent and by runtimes that must post an
// honest neutral when a GitHub read fails before the review can run).
// Re-export the Checks payload types so consumers of handleEvent/ChecksClient can name them
// without reaching into @aker-build/review directly (read-only re-export; no behavior change).
export type { ChecksPayload, CheckAnnotation } from "@aker-build/review";
export {
  run,
  safeRun,
  PrepareRepoError,
  IncompleteReviewError,
  type IncompleteReason,
  type Workspace,
  type RunnerDeps,
  type RunOutcome,
} from "./review-runner.js";
export { assertAllowedWrite, ForbiddenWriteError, ALLOWED_WRITES } from "./safety.js";
export {
  webhookEventSchema,
  toPullRequestEvent,
  REVIEWABLE_ACTIONS,
  type PullRequestEvent,
  type RawWebhookEvent,
} from "./types.js";

import type { ChecksPayload } from "@aker-build/review";
import { parseEvent } from "./webhook.js";
import { buildPayload, postCheck, type ChecksClient } from "./checks.js";
import { safeRun, type IncompleteReason, type RunnerDeps } from "./review-runner.js";
import type { PullRequestEvent } from "./types.js";

/**
 * A neutral payload for an incomplete review — never `success` (FR-011). Exported so a runtime can
 * post the same honest neutral when it cannot even reach `handleEvent` (e.g. a GitHub read fails
 * before the review runs). The `reason` MUST be a fixed, path-free, secret-free string.
 */
const INCOMPLETE_MESSAGES: Record<IncompleteReason, string> = {
  github_unavailable: "GitHub access was unavailable",
  github_metadata_unavailable: "GitHub metadata was unavailable",
  review_incomplete: "the bounded review did not complete",
  scan_budget_exceeded: "the repository exceeded the configured scan budget",
  worker_timeout: "the review worker exceeded its deadline",
  worker_crashed: "the review worker stopped unexpectedly",
  shutdown: "the service shut down before the review completed",
};

export function incompletePayload(reason: IncompleteReason): ChecksPayload {
  return {
    name: "Aker Build",
    conclusion: "neutral",
    title: "Review could not complete",
    summary: `Aker Build could not complete this review [${reason}]: ${INCOMPLETE_MESSAGES[reason]}.\n\nThis is reported as neutral — it is **not** a pass.`,
    annotations: [],
  };
}

export interface HandlerDeps extends RunnerDeps {
  checksClient: ChecksClient;
}

/**
 * The full per-event handler over an ALREADY-VERIFIED, reviewable event: run the review against an
 * ephemeral checkout, build the payload (draft→neutral; incomplete→neutral), and post the Checks
 * run. Returns the posted payload + check id for observability/testing.
 *
 * Signature verification (`verifySignature`) and action filtering (`parseEvent` → null) happen in the
 * deployment wrapper BEFORE this is called; `event` here is guaranteed reviewable.
 */
export async function handleEvent(
  event: PullRequestEvent,
  deps: HandlerDeps,
): Promise<{ payload: ChecksPayload; checkId: number; incompleteReason?: IncompleteReason }> {
  const outcome = await safeRun(event, deps);
  const payload = outcome.ok ? buildPayload(outcome.report, event) : incompletePayload(outcome.reason);
  const checkId = await postCheck(deps.checksClient, event, payload);
  return outcome.ok ? { payload, checkId } : { payload, checkId, incompleteReason: outcome.reason };
}
