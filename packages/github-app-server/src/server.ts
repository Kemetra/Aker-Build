import {
  verifySignature,
  parseEvent,
  handleEvent,
  postCheck,
  incompletePayload,
  WebhookSignatureError,
  type Workspace,
  type ChecksPayload,
} from "@tenantguard/github-app";
import type { GitHubApi } from "./github-api.js";
import { makeChecksClient } from "./checks-client.js";

export interface DispatchDeps {
  api: GitHubApi;
  workspace: Workspace;
  webhookSecret: string;
  /**
   * Prepare a freshly-checked-out repo so the gates can run: SCAN it and return the ABSOLUTE out-dir
   * holding the produced project-map. Without it the gates resolve `project-map.json` from cwd and
   * every real review degrades to neutral. Optional in `DispatchDeps` so fake-workspace tests need
   * not scan; the real `composeDeps` always supplies it.
   */
  prepareRepo?: (repoRoot: string) => string;
}

export type DispatchResult =
  | { status: 401; reason: "invalid_signature" }
  | { status: 202; reason: "ignored_non_reviewable" | "ignored_unparseable" }
  | { status: 200; payload: ChecksPayload; checkId: number }
  | { status: 502; reason: "check_post_failed" };

/**
 * Handle ONE raw webhook delivery end-to-end. The async boundary lives here: `reviewPr`/`handleEvent`
 * are SYNCHRONOUS over their data sources, so we `await` the GitHub reads FIRST and pass sync
 * closures over the resolved values into `handleEvent` (advisor: octokit is async, the engine is not).
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

  // 3. Resolve the async GitHub reads up front (octokit is async; the engine is sync). If a read
  //    fails (rate limit / 5xx / network), the review cannot complete — post an HONEST neutral check
  //    (never a false success, never a 500), matching the incomplete-review contract (FR-010).
  let changed: string[];
  let meta: { title: string; state: string; baseRefName: string };
  try {
    changed = await deps.api.listChangedFiles({ owner: event.owner, repo: event.repo, prNumber: event.prNumber });
    meta = await deps.api.getPrMetadata({ owner: event.owner, repo: event.repo, prNumber: event.prNumber });
  } catch {
    // Secret-free, fixed reason. Post the same neutral the engine would produce for incompleteness.
    const payload = incompletePayload("GitHub metadata for this PR was unavailable");
    try {
      const checkId = await postCheck(makeChecksClient(deps.api), event, payload);
      return { status: 200, payload, checkId };
    } catch {
      return { status: 502, reason: "check_post_failed" };
    }
  }

  // 4. Run the 014 handler. Review-incompleteness is already mapped to neutral inside handleEvent
  //    (safeRun); only the Checks POST can still throw, and we catch THAT here (advisor #3).
  try {
    const { payload, checkId } = await handleEvent(event, {
      checksClient: makeChecksClient(deps.api),
      workspace: deps.workspace,
      prChangedFiles: () => changed,
      prMetadata: () => meta,
      ...(deps.prepareRepo ? { prepareRepo: deps.prepareRepo } : {}),
    });
    return { status: 200, payload, checkId };
  } catch {
    // Checks API failed (rate limit / transient / permission). Secret-free reason; no retry loop.
    return { status: 502, reason: "check_post_failed" };
  }
}
