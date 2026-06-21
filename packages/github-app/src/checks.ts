import { renderChecksPayload, type ChecksPayload } from "@tenantguard/review";
import type { ReviewReport } from "@tenantguard/review";
import { assertAllowedWrite } from "./safety.js";
import type { PullRequestEvent } from "./types.js";

/**
 * A minimal Checks client the App writes through. The App supplies an octokit-backed implementation;
 * tests supply a fake. Only create/update exist — there is no method that mutates the repo.
 */
export interface ChecksClient {
  createCheck(args: { owner: string; repo: string; headSha: string; payload: ChecksPayload }): Promise<{ id: number }>;
  updateCheck(args: { owner: string; repo: string; checkId: number; payload: ChecksPayload }): Promise<void>;
  /** Find an existing TenantGuard check for this head, if any (for idempotent update — FR-012). */
  findCheck?(args: { owner: string; repo: string; headSha: string }): Promise<{ id: number } | null>;
}

/**
 * Build the final Checks payload from a review report. Reuses the merged renderer (PR #24) for the
 * ≤50-annotation cap, tier→level mapping, verdict→conclusion mapping, and overflow summary — the
 * App adds ONLY the draft override: a draft PR always concludes `neutral`, never a blocking-looking
 * failure (FR-015). Pure data; no network.
 */
export function buildPayload(report: ReviewReport, event: Pick<PullRequestEvent, "isDraft">): ChecksPayload {
  const base = renderChecksPayload(report);
  if (event.isDraft && base.conclusion === "failure") {
    return { ...base, conclusion: "neutral" };
  }
  return base;
}

/**
 * Post the payload as a Checks run. Idempotent: updates an existing TenantGuard check for this head
 * if one is found, else creates one (FR-012). Every write routes through `assertAllowedWrite` — the
 * single safety gate (FR-007). Returns the check id.
 */
export async function postCheck(
  client: ChecksClient,
  event: Pick<PullRequestEvent, "owner" | "repo" | "headSha">,
  payload: ChecksPayload,
): Promise<number> {
  const existing = client.findCheck
    ? await client.findCheck({ owner: event.owner, repo: event.repo, headSha: event.headSha })
    : null;

  if (existing) {
    assertAllowedWrite("checks.update");
    await client.updateCheck({ owner: event.owner, repo: event.repo, checkId: existing.id, payload });
    return existing.id;
  }
  assertAllowedWrite("checks.create");
  const created = await client.createCheck({
    owner: event.owner,
    repo: event.repo,
    headSha: event.headSha,
    payload,
  });
  return created.id;
}
