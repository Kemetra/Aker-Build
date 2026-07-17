import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createIntakeController, DeliveryCache, type CheckStarter } from "../src/intake.js";
import { BoundedJobQueue, type DeliveryJob } from "../src/queue.js";

const SECRET = "intake-secret";
const DELIVERY = "0b989ba4-242f-11e5-81e1-c7b6966d2516";
const rawBody = JSON.stringify({
  action: "opened",
  pull_request: { number: 42, draft: false, base: { sha: "b".repeat(40) }, head: { sha: "a".repeat(40) } },
  repository: { owner: { login: "org" }, name: "repo" },
  installation: { id: 99 },
});
const signature = `sha256=${createHmac("sha256", SECRET).update(rawBody).digest("hex")}`;

function request(over: Partial<{ rawBody: string; signature: string; eventName: string; deliveryId: string }> = {}) {
  return { rawBody, signature, eventName: "pull_request", deliveryId: DELIVERY, ...over };
}

function harness(over: { queue?: BoundedJobQueue; checks?: CheckStarter; cache?: DeliveryCache; timeout?: number } = {}) {
  const ran: DeliveryJob[] = [];
  const queue =
    over.queue ??
    new BoundedJobQueue({ concurrency: 1, maxWaiting: 1, execute: async (job) => void ran.push(job) });
  const checks: CheckStarter = over.checks ?? { ensureInProgress: vi.fn(async () => 123) };
  const controller = createIntakeController({
    webhookSecret: SECRET,
    installationId: 99,
    queue,
    checks,
    deliveryCache: over.cache ?? new DeliveryCache({ ttlMs: 60_000, maxEntries: 10 }),
    checkStartTimeoutMs: over.timeout ?? 100,
  });
  return { controller, queue, checks, ran };
}

describe("webhook intake boundary", () => {
  it("establishes an in-progress check before 202 and starts work only after response activation", async () => {
    const h = harness();
    const result = await h.controller.accept(request());
    expect(result).toMatchObject({ status: 202, reason: "accepted" });
    expect(h.checks.ensureInProgress).toHaveBeenCalledOnce();
    expect(h.ran).toEqual([]);
    result.afterResponse?.();
    await h.queue.onIdle();
    expect(h.ran).toHaveLength(1);
    expect(h.ran[0]).toMatchObject({ checkId: 123, deliveryHash: expect.not.stringContaining(DELIVERY) });
  });

  it.each([
    ["invalid signature", request({ signature: "sha256=bad" }), 401, "invalid_signature"],
    ["wrong event", request({ eventName: "issues" }), 202, "ignored_event"],
    ["invalid delivery", request({ deliveryId: "not-a-guid" }), 400, "invalid_delivery"],
  ] as const)("rejects/ignores %s before a check or job", async (_name, input, status, reason) => {
    const h = harness();
    const result = await h.controller.accept(input);
    expect(result).toMatchObject({ status, reason });
    expect(h.checks.ensureInProgress).not.toHaveBeenCalled();
    expect(h.queue.stats()).toMatchObject({ active: 0, waiting: 0, reserved: 0 });
  });

  it("rejects a different installation before check/checkout", async () => {
    const body = JSON.stringify({ ...JSON.parse(rawBody), installation: { id: 100 } });
    const sig = `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
    const h = harness();
    const result = await h.controller.accept(request({ rawBody: body, signature: sig }));
    expect(result).toMatchObject({ status: 403, reason: "wrong_installation" });
    expect(h.checks.ensureInProgress).not.toHaveBeenCalled();
  });

  it("deduplicates a delivery ID without a second check or job", async () => {
    const h = harness();
    const first = await h.controller.accept(request());
    const duplicate = await h.controller.accept(request());
    expect(duplicate).toMatchObject({ status: 202, reason: "duplicate" });
    expect(h.checks.ensureInProgress).toHaveBeenCalledOnce();
    first.afterResponse?.();
    await h.queue.onIdle();
    expect(h.ran).toHaveLength(1);
  });

  it("returns 503 when queue capacity cannot be reserved", async () => {
    const queue = new BoundedJobQueue({ concurrency: 1, maxWaiting: 0, execute: async () => new Promise(() => {}) });
    const held = queue.reserve();
    expect(held).not.toBeNull();
    const h = harness({ queue });
    const result = await h.controller.accept(request());
    expect(result).toMatchObject({ status: 503, reason: "queue_full" });
    expect(h.checks.ensureInProgress).not.toHaveBeenCalled();
    held!.release();
  });

  it("releases queue and delivery reservations when the initial check times out", async () => {
    const checks: CheckStarter = { ensureInProgress: vi.fn(async () => new Promise<number>(() => {})) };
    const cache = new DeliveryCache({ ttlMs: 60_000, maxEntries: 10 });
    const h = harness({ checks, cache, timeout: 5 });
    const failed = await h.controller.accept(request());
    expect(failed).toMatchObject({ status: 502, reason: "check_start_failed" });
    expect(h.queue.stats().reserved).toBe(0);

    const retryChecks: CheckStarter = { ensureInProgress: vi.fn(async () => 9) };
    const retry = createIntakeController({
      webhookSecret: SECRET,
      installationId: 99,
      queue: h.queue,
      checks: retryChecks,
      deliveryCache: cache,
      checkStartTimeoutMs: 100,
    });
    expect(await retry.accept(request())).toMatchObject({ status: 202, reason: "accepted" });
  });
});
