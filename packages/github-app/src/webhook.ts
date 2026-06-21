import { createHmac, timingSafeEqual } from "node:crypto";
import {
  webhookEventSchema,
  toPullRequestEvent,
  REVIEWABLE_ACTIONS,
  type PullRequestEvent,
} from "./types.js";

export class WebhookSignatureError extends Error {
  constructor(message = "webhook signature verification failed") {
    super(message);
    this.name = "WebhookSignatureError";
  }
}

/**
 * Verify the GitHub `X-Hub-Signature-256` HMAC over the raw body. Constant-time comparison.
 * MUST pass before the payload is parsed/trusted (boundary integrity).
 */
export function verifySignature(rawBody: string, signatureHeader: string | undefined, secret: string): void {
  if (!signatureHeader) throw new WebhookSignatureError("missing signature header");
  const expected = `sha256=${createHmac("sha256", secret).update(rawBody).digest("hex")}`;
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new WebhookSignatureError();
  }
}

/**
 * Parse a verified raw body into a normalized event IF it is a reviewable PR action.
 * Returns `null` for actions outside REVIEWABLE_ACTIONS (drop, not an error). Throws on a
 * structurally invalid payload (Zod) — that is a real boundary failure.
 */
export function parseEvent(rawBody: string): PullRequestEvent | null {
  const parsed = webhookEventSchema.parse(JSON.parse(rawBody));
  if (!(REVIEWABLE_ACTIONS as readonly string[]).includes(parsed.action)) return null;
  return toPullRequestEvent(parsed);
}
