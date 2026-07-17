import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeMetrics } from "../src/metrics.js";
import { BoundedJobQueue } from "../src/queue.js";
import { loadRuntimeConfig } from "../src/runtime-config.js";
import { startRuntimeServer, type RuntimeServer } from "../src/runtime-host.js";
import type { IntakeController } from "../src/intake.js";

const servers: RuntimeServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.shutdown()));
});

function runtime(over: { ready?: boolean; accept?: IntakeController["accept"] } = {}) {
  const afterResponse = vi.fn();
  const queue = new BoundedJobQueue({ concurrency: 1, maxWaiting: 1, execute: async () => {} });
  if (over.ready === false) {
    const held = [queue.reserve(), queue.reserve()];
    expect(held.every(Boolean)).toBe(true);
  }
  const executor = { terminateAll: vi.fn(async () => {}) };
  const metrics = new RuntimeMetrics();
  metrics.increment("intake_total", 2);
  const service = {
    intake: {
      accept:
        over.accept ??
        (async () => ({ status: 202 as const, reason: "accepted" as const, afterResponse })),
    },
    queue,
    executor,
    metrics,
    config: loadRuntimeConfig({ PORT: "3000" }),
    cleanup: vi.fn(() => ({ removed: 0, failed: 0 })),
  };
  return { service, afterResponse, executor };
}

async function listen(service: ReturnType<typeof runtime>["service"]): Promise<{ server: RuntimeServer; base: string }> {
  const server = startRuntimeServer(service, { port: 0, installSignalHandlers: false });
  servers.push(server);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const port = (server.address() as AddressInfo).port;
  return { server, base: `http://127.0.0.1:${port}` };
}

describe("bounded runtime HTTP host", () => {
  it("ends the 202 response before activating the accepted job", async () => {
    const h = runtime();
    const { base } = await listen(h.service);
    const response = await fetch(`${base}/webhook`, {
      method: "POST",
      body: "{}",
      headers: {
        "x-hub-signature-256": "sha256=test",
        "x-github-event": "pull_request",
        "x-github-delivery": "0b989ba4-242f-11e5-81e1-c7b6966d2516",
      },
    });
    expect(response.status).toBe(202);
    await response.text();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(h.afterResponse).toHaveBeenCalledOnce();
  });

  it("serves liveness, readiness, and fixed numeric metrics without entering intake", async () => {
    const h = runtime();
    const accept = vi.spyOn(h.service.intake, "accept");
    const { base } = await listen(h.service);
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/readyz`)).status).toBe(200);
    const metrics = await (await fetch(`${base}/metrics`)).json() as Record<string, unknown>;
    expect(metrics.intake_total).toBe(2);
    expect(Object.values(metrics).every((value) => typeof value === "number")).toBe(true);
    expect(accept).not.toHaveBeenCalled();
  });

  it("returns 503 readiness when the queue has no capacity", async () => {
    const h = runtime({ ready: false });
    const { base } = await listen(h.service);
    expect((await fetch(`${base}/readyz`)).status).toBe(503);
  });

  it("sets all Node socket/request timeouts explicitly", async () => {
    const h = runtime();
    const { server } = await listen(h.service);
    expect(server.requestTimeout).toBe(h.service.config.requestTimeoutMs);
    expect(server.headersTimeout).toBe(h.service.config.headersTimeoutMs);
    expect(server.keepAliveTimeout).toBe(h.service.config.keepAliveTimeoutMs);
    expect(server.timeout).toBe(h.service.config.socketTimeoutMs);
  });

  it("shutdown stops admission, drains/terminates, cleans stale workspaces, and closes", async () => {
    const h = runtime();
    const { server } = await listen(h.service);
    await server.shutdown();
    expect(h.service.queue.stats().accepting).toBe(false);
    expect(h.executor.terminateAll).toHaveBeenCalledOnce();
    expect(h.service.cleanup).toHaveBeenCalledOnce();
    expect(server.listening).toBe(false);
    servers.splice(servers.indexOf(server), 1);
  });

  it("clears the drain deadline when an idle queue shuts down immediately", async () => {
    vi.useFakeTimers();
    try {
      const h = runtime();
      const { server } = await listen(h.service);
      await server.shutdown();
      expect(vi.getTimerCount()).toBe(0);
      servers.splice(servers.indexOf(server), 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
