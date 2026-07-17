import type { IncompleteReason } from "@aker-build/github-app";
import type { ScanUsage } from "@aker-build/scanner";
import { fork } from "node:child_process";
import { fileURLToPath } from "node:url";
import type { DeliveryJob } from "./queue.js";

export interface WorkerParentMessage {
  type: "run";
  job: DeliveryJob;
}

export type WorkerOutcomeCode = "success" | "failure" | "neutral" | "worker_failed";
export type WorkerExecutionCode = Exclude<WorkerOutcomeCode, "worker_failed"> | IncompleteReason;

export interface WorkerExecutionResult {
  code: WorkerExecutionCode;
  usage: ScanUsage;
  githubRetries: number;
}

export interface WorkerResultMessage {
  type: "result";
  code: WorkerOutcomeCode;
  incompleteReason?: IncompleteReason;
  usage: ScanUsage;
  githubRetries: number;
}

export interface WorkerChild {
  send(message: WorkerParentMessage): boolean;
  kill(signal?: NodeJS.Signals): boolean;
  once(event: "message", listener: (message: unknown) => void): this;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  removeAllListeners(event?: string): this;
}

interface ActiveWorker {
  finish(reason: IncompleteReason | null, message?: WorkerResultMessage): Promise<void>;
}

export class ForkWorkerExecutor {
  readonly #spawn: () => WorkerChild;
  readonly #timeoutMs: number;
  readonly #completeNeutral: (job: DeliveryJob, reason: IncompleteReason) => Promise<void>;
  readonly #active = new Map<WorkerChild, ActiveWorker>();

  constructor(args: {
    spawn: () => WorkerChild;
    timeoutMs: number;
    completeNeutral: (job: DeliveryJob, reason: IncompleteReason) => Promise<void>;
  }) {
    this.#spawn = args.spawn;
    this.#timeoutMs = args.timeoutMs;
    this.#completeNeutral = args.completeNeutral;
  }

  execute(job: DeliveryJob): Promise<WorkerExecutionResult> {
    let child: WorkerChild;
    try {
      child = this.#spawn();
    } catch {
      return this.#neutralizeWithoutChild(job, "worker_crashed");
    }
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        void finish("worker_timeout");
      }, this.#timeoutMs);

      const finish = async (reason: IncompleteReason | null, message?: WorkerResultMessage): Promise<void> => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.removeAllListeners();
        this.#active.delete(child);
        if (reason) {
          try {
            await this.#completeNeutral(job, reason);
          } catch {
            // A failed final Checks update cannot be made safe by exposing or retrying arbitrary data.
          }
        }
        resolve({
          code: reason ?? message?.incompleteReason ??
            (message?.code === "worker_failed" || !message ? "worker_crashed" : message.code),
          usage: message?.usage ?? EMPTY_USAGE,
          githubRetries: message?.githubRetries ?? 0,
        });
      };

      this.#active.set(child, { finish });
      child.once("message", (message) => {
        if (isWorkerResult(message)) {
          void finish(message.code === "worker_failed" ? "worker_crashed" : null, message);
        } else {
          child.kill("SIGKILL");
          void finish("worker_crashed");
        }
      });
      child.once("exit", () => void finish("worker_crashed"));
      try {
        if (!child.send({ type: "run", job })) {
          child.kill("SIGKILL");
          void finish("worker_crashed");
        }
      } catch {
        child.kill("SIGKILL");
        void finish("worker_crashed");
      }
    });
  }

  async #neutralizeWithoutChild(
    job: DeliveryJob,
    reason: IncompleteReason,
  ): Promise<WorkerExecutionResult> {
    try {
      await this.#completeNeutral(job, reason);
    } catch {
      // Preserve the fixed result even when GitHub is unavailable; never surface arbitrary details.
    }
    return { code: reason, usage: EMPTY_USAGE, githubRetries: 0 };
  }

  async terminateAll(): Promise<void> {
    const active = [...this.#active.entries()];
    await Promise.all(
      active.map(async ([child, worker]) => {
        child.kill("SIGKILL");
        await worker.finish("shutdown");
      }),
    );
  }

  activeCount(): number {
    return this.#active.size;
  }
}

export function spawnWorkerChild(): WorkerChild {
  const current = fileURLToPath(import.meta.url);
  const extension = current.endsWith(".ts") ? "ts" : "mjs";
  const entry = fileURLToPath(new URL(`./worker-entry.${extension}`, import.meta.url));
  return fork(entry, [], {
    stdio: ["ignore", "ignore", "ignore", "ipc"],
    env: process.env,
    execArgv: process.execArgv,
    serialization: "json",
  }) as unknown as WorkerChild;
}

export function isWorkerParentMessage(value: unknown): value is WorkerParentMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<WorkerParentMessage>;
  if (message.type !== "run" || !message.job || typeof message.job !== "object") return false;
  const { event, checkId, deliveryHash } = message.job;
  return (
    Number.isSafeInteger(checkId) &&
    checkId > 0 &&
    /^[0-9a-f]{16}$/u.test(deliveryHash) &&
    !!event &&
    /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(event.owner) &&
    /^[A-Za-z0-9._][A-Za-z0-9._-]{0,99}$/u.test(event.repo) &&
    event.repo !== "." &&
    event.repo !== ".." &&
    Number.isSafeInteger(event.prNumber) &&
    event.prNumber > 0 &&
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(event.baseSha) &&
    /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(event.headSha) &&
    typeof event.isDraft === "boolean" &&
    Number.isSafeInteger(event.installationId) &&
    (event.installationId ?? 0) > 0
  );
}

function isWorkerResult(value: unknown): value is WorkerResultMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Partial<WorkerResultMessage>;
  if (
    message.type !== "result" ||
    (message.code !== "success" && message.code !== "failure" && message.code !== "neutral" && message.code !== "worker_failed")
  ) return false;
  if (!isCount(message.githubRetries)) return false;
  if (message.incompleteReason !== undefined && !INCOMPLETE_REASONS.has(message.incompleteReason)) return false;
  if (message.code !== "neutral" && message.incompleteReason !== undefined) return false;
  const usage = message.usage;
  return (
    !!usage &&
    isCount(usage.filesConsidered) &&
    isCount(usage.filesRead) &&
    isCount(usage.bytesRead)
  );
}

const EMPTY_USAGE: ScanUsage = { filesConsidered: 0, filesRead: 0, bytesRead: 0 };
const INCOMPLETE_REASONS = new Set<IncompleteReason>([
  "github_unavailable",
  "github_metadata_unavailable",
  "review_incomplete",
  "scan_budget_exceeded",
  "worker_timeout",
  "worker_crashed",
  "shutdown",
]);

function isCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}
