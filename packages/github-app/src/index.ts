// Public surface for @tenantguard/github-app.
// Report-only GitHub App (roadmap P4): on a PR event, run the review-pr chain at the head ref and
// post a Checks run + annotations. No repository mutation; stateless; secret-safe.

export { verifySignature, parseEvent, WebhookSignatureError } from "./webhook.js";
export { buildPayload, postCheck, type ChecksClient } from "./checks.js";
export {
  run,
  safeRun,
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

import type { ChecksPayload } from "@tenantguard/review";
import { parseEvent } from "./webhook.js";
import { buildPayload, postCheck, type ChecksClient } from "./checks.js";
import { safeRun, type RunnerDeps } from "./review-runner.js";
import type { PullRequestEvent } from "./types.js";

/** A neutral payload for an incomplete review — never `success` (FR-011). */
function incompletePayload(reason: string): ChecksPayload {
  return {
    name: "TenantGuard",
    conclusion: "neutral",
    title: "Review could not complete",
    summary: `TenantGuard could not complete this review: ${reason}\n\nThis is reported as neutral — it is **not** a pass.`,
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
): Promise<{ payload: ChecksPayload; checkId: number }> {
  const outcome = await safeRun(event, deps);
  const payload = outcome.ok ? buildPayload(outcome.report, event) : incompletePayload(outcome.reason);
  const checkId = await postCheck(deps.checksClient, event, payload);
  return { payload, checkId };
}
