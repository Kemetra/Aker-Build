import { z } from "zod";

/**
 * The subset of a GitHub `pull_request` webhook the App reads. Validated at the boundary (Zod) before
 * any processing. We deliberately model only what we consume — extra fields are ignored, not trusted.
 */
export const webhookEventSchema = z.object({
  action: z.string().min(1),
  pull_request: z.object({
    number: z.number().int().positive(),
    draft: z.boolean().optional(),
    // A commit SHA only — a 40-hex (SHA-1) or 64-hex (SHA-256) string. Rejecting anything else at the
    // boundary stops a crafted `head.sha` (e.g. one starting with `-`) from ever reaching `git fetch`
    // as an option rather than a ref (argument-injection defense; the runner also passes `--`).
    head: z.object({ sha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i) }),
  }),
  repository: z.object({
    owner: z.object({ login: z.string().min(1) }),
    name: z.string().min(1),
  }),
  installation: z.object({ id: z.number().int() }).optional(),
});

export type RawWebhookEvent = z.infer<typeof webhookEventSchema>;

/** Actions that trigger a review. Any other action is dropped (no check produced) — not an error. */
export const REVIEWABLE_ACTIONS = ["opened", "reopened", "synchronize"] as const;

/** The normalized event the runner acts on. Transient — never persisted. */
export interface PullRequestEvent {
  owner: string;
  repo: string;
  prNumber: number;
  headSha: string;
  isDraft: boolean;
  installationId: number | null;
}

/** Normalize a verified raw payload into the internal event shape. */
export function toPullRequestEvent(raw: RawWebhookEvent): PullRequestEvent {
  return {
    owner: raw.repository.owner.login,
    repo: raw.repository.name,
    prNumber: raw.pull_request.number,
    headSha: raw.pull_request.head.sha,
    isDraft: raw.pull_request.draft ?? false,
    installationId: raw.installation?.id ?? null,
  };
}
