import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { DeliveryJob } from "../src/queue.js";
import {
  ForkWorkerExecutor,
  type WorkerChild,
  type WorkerParentMessage,
} from "../src/worker-executor.js";

const job: DeliveryJob = {
  event: {
    owner: "org",
    repo: "repo",
    prNumber: 1,
    baseSha: "b".repeat(40),
    headSha: "a".repeat(40),
    isDraft: false,
    installationId: 99,
  },
  checkId: 12,
  deliveryHash: "0123456789abcdef",
};

class FakeChild extends EventEmitter implements WorkerChild {
  sent: WorkerParentMessage[] = [];
  killed = false;

  send(message: WorkerParentMessage): boolean {
    this.sent.push(message);
    return true;
  }

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

describe("ForkWorkerExecutor", () => {
  it("neutralizes the known check when the worker cannot be spawned", async () => {
    const neutral = vi.fn(async () => {});
    const executor = new ForkWorkerExecutor({
      spawn: () => { throw new Error("process limit with private details"); },
      timeoutMs: 100,
      completeNeutral: neutral,
    });

    await expect(executor.execute(job)).resolves.toEqual({
      code: "worker_crashed",
      usage: { filesConsidered: 0, filesRead: 0, bytesRead: 0 },
      githubRetries: 0,
    });
    expect(neutral).toHaveBeenCalledWith(job, "worker_crashed");
  });

  it("sends metadata-only IPC and accepts a fixed completed outcome", async () => {
    const child = new FakeChild();
    const neutral = vi.fn(async () => {});
    const executor = new ForkWorkerExecutor({ spawn: () => child, timeoutMs: 100, completeNeutral: neutral });
    const running = executor.execute(job);
    expect(child.sent).toHaveLength(1);
    expect(Object.keys(child.sent[0] ?? {}).sort()).toEqual(["job", "type"]);
    expect(JSON.stringify(child.sent[0])).not.toContain("signature");
    expect(JSON.stringify(child.sent[0])).not.toContain("privateKey");
    child.emit("message", {
      type: "result",
      code: "success",
      usage: { filesConsidered: 3, filesRead: 2, bytesRead: 10 },
      githubRetries: 2,
    });
    child.emit("exit", 0, null);
    await expect(running).resolves.toEqual({
      code: "success",
      usage: { filesConsidered: 3, filesRead: 2, bytesRead: 10 },
      githubRetries: 2,
    });
    expect(neutral).not.toHaveBeenCalled();
  });

  it("accepts only closed incomplete reasons from a neutral worker", async () => {
    const child = new FakeChild();
    const executor = new ForkWorkerExecutor({ spawn: () => child, timeoutMs: 100, completeNeutral: vi.fn() });
    const running = executor.execute(job);
    child.emit("message", {
      type: "result",
      code: "neutral",
      incompleteReason: "scan_budget_exceeded",
      usage: { filesConsidered: 50001, filesRead: 1, bytesRead: 10 },
      githubRetries: 0,
    });
    await expect(running).resolves.toEqual({
      code: "scan_budget_exceeded",
      usage: { filesConsidered: 50001, filesRead: 1, bytesRead: 10 },
      githubRetries: 0,
    });
  });

  it("rejects arbitrary child reason text", async () => {
    const child = new FakeChild();
    const neutral = vi.fn(async () => {});
    const executor = new ForkWorkerExecutor({ spawn: () => child, timeoutMs: 100, completeNeutral: neutral });
    const running = executor.execute(job);
    child.emit("message", {
      type: "result",
      code: "neutral",
      incompleteReason: "C:/secret/private exception",
      usage: { filesConsidered: 0, filesRead: 0, bytesRead: 0 },
      githubRetries: 0,
    });
    await expect(running).resolves.toMatchObject({ code: "worker_crashed" });
    expect(neutral).toHaveBeenCalledWith(job, "worker_crashed");
  });

  it("kills a timed-out child and completes the known check neutral", async () => {
    const child = new FakeChild();
    const neutral = vi.fn(async () => {});
    const executor = new ForkWorkerExecutor({ spawn: () => child, timeoutMs: 5, completeNeutral: neutral });
    await executor.execute(job);
    expect(child.killed).toBe(true);
    expect(neutral).toHaveBeenCalledWith(job, "worker_timeout");
  });

  it("maps exit-before-result and malformed messages to worker_crashed", async () => {
    for (const trigger of [
      (child: FakeChild) => child.emit("exit", 1, null),
      (child: FakeChild) => child.emit("message", { type: "result", code: "raw exception text" }),
    ]) {
      const child = new FakeChild();
      const neutral = vi.fn(async () => {});
      const executor = new ForkWorkerExecutor({ spawn: () => child, timeoutMs: 100, completeNeutral: neutral });
      const running = executor.execute(job);
      trigger(child);
      await running;
      expect(neutral).toHaveBeenCalledWith(job, "worker_crashed");
    }
  });

  it("terminateAll kills active children and marks them as shutdown", async () => {
    const child = new FakeChild();
    const neutral = vi.fn(async () => {});
    const executor = new ForkWorkerExecutor({ spawn: () => child, timeoutMs: 1000, completeNeutral: neutral });
    const running = executor.execute(job);
    await executor.terminateAll();
    await running;
    expect(child.killed).toBe(true);
    expect(neutral).toHaveBeenCalledWith(job, "shutdown");
  });
});
