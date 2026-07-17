import { createHash } from "node:crypto";
import {
  parseEvent,
  verifySignature,
  WebhookSignatureError,
  type PullRequestEvent,
} from "@aker-build/github-app";
import type { BoundedJobQueue } from "./queue.js";

export interface CheckStarter {
  ensureInProgress(
    event: PullRequestEvent,
    context: { deliveryHash: string; signal: AbortSignal },
  ): Promise<number>;
}

export interface IntakeRequest {
  rawBody: string;
  signature: string | undefined;
  eventName: string | undefined;
  deliveryId: string | undefined;
}

export type IntakeReason =
  | "accepted"
  | "duplicate"
  | "ignored_event"
  | "ignored_action"
  | "invalid_signature"
  | "invalid_payload"
  | "invalid_delivery"
  | "wrong_installation"
  | "queue_full"
  | "delivery_cache_full"
  | "check_start_failed";

export interface IntakeResult {
  status: 202 | 400 | 401 | 403 | 502 | 503;
  reason: IntakeReason;
  afterResponse?: () => void;
}

export interface IntakeController {
  accept(request: IntakeRequest): Promise<IntakeResult>;
}

type CacheState = "reserved" | "accepted";

export class DeliveryCache {
  readonly #ttlMs: number;
  readonly #maxEntries: number;
  readonly #entries = new Map<string, { state: CacheState; expiresAt: number }>();
  readonly #now: () => number;

  constructor(args: { ttlMs: number; maxEntries: number; now?: () => number }) {
    this.#ttlMs = args.ttlMs;
    this.#maxEntries = args.maxEntries;
    this.#now = args.now ?? Date.now;
  }

  reserve(id: string): "reserved" | "duplicate" | "full" {
    this.#purge();
    if (this.#entries.has(id)) return "duplicate";
    if (this.#entries.size >= this.#maxEntries) return "full";
    this.#entries.set(id, { state: "reserved", expiresAt: this.#now() + this.#ttlMs });
    return "reserved";
  }

  accept(id: string): void {
    const entry = this.#entries.get(id);
    if (entry) entry.state = "accepted";
  }

  release(id: string): void {
    if (this.#entries.get(id)?.state === "reserved") this.#entries.delete(id);
  }

  #purge(): void {
    const now = this.#now();
    for (const [id, entry] of this.#entries) {
      if (entry.expiresAt <= now) this.#entries.delete(id);
    }
  }
}

export function createIntakeController(deps: {
  webhookSecret: string;
  installationId: number;
  queue: BoundedJobQueue;
  checks: CheckStarter;
  deliveryCache: DeliveryCache;
  checkStartTimeoutMs: number;
}): IntakeController {
  return {
    async accept(request: IntakeRequest): Promise<IntakeResult> {
      try {
        verifySignature(request.rawBody, request.signature, deps.webhookSecret);
      } catch (error) {
        if (error instanceof WebhookSignatureError) return { status: 401, reason: "invalid_signature" };
        throw error;
      }

      if (request.eventName !== "pull_request") return { status: 202, reason: "ignored_event" };

      let event: PullRequestEvent | null;
      try {
        event = parseEvent(request.rawBody);
      } catch {
        return { status: 400, reason: "invalid_payload" };
      }
      if (event === null) return { status: 202, reason: "ignored_action" };
      if (event.installationId !== deps.installationId) return { status: 403, reason: "wrong_installation" };
      if (!request.deliveryId || !isDeliveryGuid(request.deliveryId)) {
        return { status: 400, reason: "invalid_delivery" };
      }

      const cache = deps.deliveryCache.reserve(request.deliveryId);
      if (cache === "duplicate") return { status: 202, reason: "duplicate" };
      if (cache === "full") return { status: 503, reason: "delivery_cache_full" };

      const reservation = deps.queue.reserve();
      if (!reservation) {
        deps.deliveryCache.release(request.deliveryId);
        return { status: 503, reason: "queue_full" };
      }

      const deliveryHash = createHash("sha256").update(request.deliveryId).digest("hex").slice(0, 16);
      const abort = new AbortController();
      let checkId: number;
      try {
        checkId = await withTimeout(
          deps.checks.ensureInProgress(event, { deliveryHash, signal: abort.signal }),
          deps.checkStartTimeoutMs,
          abort,
        );
      } catch {
        reservation.release();
        deps.deliveryCache.release(request.deliveryId);
        return { status: 502, reason: "check_start_failed" };
      }

      deps.deliveryCache.accept(request.deliveryId);
      const afterResponse = reservation.commit({ event, checkId, deliveryHash });
      return { status: 202, reason: "accepted", afterResponse };
    },
  };
}

function isDeliveryGuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, abort: AbortController): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          abort.abort();
          reject(new Error("operation timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}
