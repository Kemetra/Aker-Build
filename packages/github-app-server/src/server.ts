import {
  verifySignature,
  parseEvent,
  handleEvent,
  postCheck,
  incompletePayload,
  WebhookSignatureError,
  type Workspace,
  type ChecksPayload,
  type IncompleteReason,
  type PullRequestEvent,
} from "@aker-build/github-app";
import type { GitHubApi } from "./github-api.js";
import { makeChecksClient } from "./checks-client.js";

export interface DispatchDeps {
  api: GitHubApi;
  workspace: Workspace;
  webhookSecret: string;
}

export type DispatchResult =
  | { status: 401; reason: "invalid_signature" }
  | { status: 202; reason: "ignored_non_reviewable" | "ignored_unparseable" }
  | { status: 200; payload: ChecksPayload; checkId: number; incompleteReason?: IncompleteReason }
  | { status: 502; reason: "check_post_failed" };

export type ProcessedEventResult = Extract<DispatchResult, { status: 200 | 502 }>;

/**
 * Handle ONE raw webhook delivery end-to-end. PR title/state/base-name metadata is resolved before
 * the synchronous comparison; changed lines come from the two exact webhook-SHA checkouts, not the
 * GitHub files/patch API (which can truncate large PRs).
 *
 * Order (Contract B): verify signature → parse/filter action → resolve reads → handleEvent → respond.
 * A Checks-POST failure is caught HERE at the boundary (postCheck runs outside 014's safeRun); it
 * returns 502 with a secret-free reason — never an uncaught throw, never a leak.
 */
export async function dispatch(rawBody: string, signature: string | undefined, deps: DispatchDeps): Promise<DispatchResult> {
  // 1. Signature — reject before parsing/dispatch (FR-008).
  try {
    verifySignature(rawBody, signature, deps.webhookSecret);
  } catch (err) {
    if (err instanceof WebhookSignatureError) return { status: 401, reason: "invalid_signature" };
    throw err;
  }

  // 2. Parse + action filter. A non-reviewable action → acknowledged, no check (FR-009). A
  //    structurally-unparseable body (GitHub's `ping`, a non-PR event, malformed JSON) is NOT a
  //    server error: parseEvent can throw (JSON/Zod), so we guard it and acknowledge with 202 rather
  //    than 500 — a 5xx would make GitHub redeliver the same bad payload forever (FR-008/FR-009).
  let event;
  try {
    event = parseEvent(rawBody);
  } catch {
    return { status: 202, reason: "ignored_unparseable" };
  }
  if (event === null) return { status: 202, reason: "ignored_non_reviewable" };

  return processVerifiedEvent(event, deps);
}

/** Process one already-verified, already-validated event. Safe for metadata-only worker IPC. */
export async function processVerifiedEvent(
  event: PullRequestEvent,
  deps: DispatchDeps,
): Promise<ProcessedEventResult> {

  // 3. Resolve the async GitHub reads up front (octokit is async; the engine is sync). If a read
  //    fails (rate limit / 5xx / network), the review cannot complete — post an HONEST neutral check
  //    (never a false success, never a 500), matching the incomplete-review contract (FR-010).
  let meta: { title: string; state: string; baseRefName: string };
  try {
    meta = await deps.api.getPrMetadata({ owner: event.owner, repo: event.repo, prNumber: event.prNumber });
  } catch {
    // Secret-free, fixed reason. Post the same neutral the engine would produce for incompleteness.
    const payload = incompletePayload("github_metadata_unavailable");
    try {
      const checkId = await postCheck(makeChecksClient(deps.api), event, payload);
      return { status: 200, payload, checkId, incompleteReason: "github_metadata_unavailable" };
    } catch {
      return { status: 502, reason: "check_post_failed" };
    }
  }

  // 4. Run the 014 handler. Review-incompleteness is already mapped to neutral inside handleEvent
  //    (safeRun); only the Checks POST can still throw, and we catch THAT here (advisor #3).
  try {
    const { payload, checkId, incompleteReason } = await handleEvent(event, {
      checksClient: makeChecksClient(deps.api),
      workspace: deps.workspace,
      prMetadata: () => meta,
    });
    return { status: 200, payload, checkId, ...(incompleteReason ? { incompleteReason } : {}) };
  } catch {
    // Checks API failed (rate limit / transient / permission). Secret-free reason; no retry loop.
    return { status: 502, reason: "check_post_failed" };
  }
}
