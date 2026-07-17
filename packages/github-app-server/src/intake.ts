import { createHash } from "node:crypto";
import {
  parseEvent,
  verifySignature,
  WebhookSignatureError,
  type PullRequestEvent,
} from "@aker-build/github-app";
import type { BoundedJobQueue, QueueReservation } from "./queue.js";

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

interface IntakeDeps {
  webhookSecret: string;
  installationId: number;
  queue: BoundedJobQueue;
  checks: CheckStarter;
  deliveryCache: DeliveryCache;
  checkStartTimeoutMs: number;
}

interface ReservedDelivery {
  event: PullRequestEvent;
  deliveryId: string;
  reservation: QueueReservation;
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

export function createIntakeController(deps: IntakeDeps): IntakeController {
  return {
    async accept(request: IntakeRequest): Promise<IntakeResult> {
      const event = verifiedEvent(request, deps);
      if (isIntakeResult(event)) return event;
      const delivery = reserveDelivery(request, event, deps);
      if (isIntakeResult(delivery)) return delivery;
      return createInitialCheck(delivery, deps);
    },
  };
}

function verifiedEvent(request: IntakeRequest, deps: IntakeDeps): PullRequestEvent | IntakeResult {
  const signatureError = signatureErrorFor(request, deps.webhookSecret);
  if (signatureError) return signatureError;
  const event = parsedEvent(request);
  if (isIntakeResult(event)) return event;
  return event.installationId === deps.installationId ? event : { status: 403, reason: "wrong_installation" };
}

function signatureErrorFor(request: IntakeRequest, webhookSecret: string): IntakeResult | undefined {
  try {
    verifySignature(request.rawBody, request.signature, webhookSecret);
  } catch (error) {
    if (error instanceof WebhookSignatureError) return { status: 401, reason: "invalid_signature" };
    throw error;
  }
}

function parsedEvent(request: IntakeRequest): PullRequestEvent | IntakeResult {
  if (request.eventName !== "pull_request") return { status: 202, reason: "ignored_event" };
  try {
    const event = parseEvent(request.rawBody);
    return event ?? { status: 202, reason: "ignored_action" };
  } catch {
    return { status: 400, reason: "invalid_payload" };
  }
}

function reserveDelivery(request: IntakeRequest, event: PullRequestEvent, deps: IntakeDeps): ReservedDelivery | IntakeResult {
  const deliveryId = validDeliveryId(request.deliveryId);
  if (!deliveryId) return { status: 400, reason: "invalid_delivery" };
  const cacheResult = reserveCache(deliveryId, deps.deliveryCache);
  if (cacheResult) return cacheResult;
  const reservation = deps.queue.reserve();
  if (!reservation) return releaseCacheAndQueueFull(deliveryId, deps.deliveryCache);
  return { event, deliveryId, reservation };
}

function validDeliveryId(value: string | undefined): string | undefined {
  return value && isDeliveryGuid(value) ? value : undefined;
}

function reserveCache(deliveryId: string, cache: DeliveryCache): IntakeResult | undefined {
  const state = cache.reserve(deliveryId);
  if (state === "duplicate") return { status: 202, reason: "duplicate" };
  if (state === "full") return { status: 503, reason: "delivery_cache_full" };
}

function releaseCacheAndQueueFull(deliveryId: string, cache: DeliveryCache): IntakeResult {
  cache.release(deliveryId);
  return { status: 503, reason: "queue_full" };
}

async function createInitialCheck(delivery: ReservedDelivery, deps: IntakeDeps): Promise<IntakeResult> {
  const deliveryHash = createHash("sha256").update(delivery.deliveryId).digest("hex").slice(0, 16);
  const checkId = await startingCheckId(delivery, deliveryHash, deps);
  if (checkId === undefined) return { status: 502, reason: "check_start_failed" };
  deps.deliveryCache.accept(delivery.deliveryId);
  const afterResponse = delivery.reservation.commit({ event: delivery.event, checkId, deliveryHash });
  return { status: 202, reason: "accepted", afterResponse };
}

async function startingCheckId(delivery: ReservedDelivery, deliveryHash: string, deps: IntakeDeps): Promise<number | undefined> {
  const abort = new AbortController();
  try {
    return await withTimeout(
      deps.checks.ensureInProgress(delivery.event, { deliveryHash, signal: abort.signal }),
      deps.checkStartTimeoutMs,
      abort,
    );
  } catch {
    delivery.reservation.release();
    deps.deliveryCache.release(delivery.deliveryId);
  }
}

function isIntakeResult(value: PullRequestEvent | IntakeResult | ReservedDelivery): value is IntakeResult {
  return "status" in value;
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
