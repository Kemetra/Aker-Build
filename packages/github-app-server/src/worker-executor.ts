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
  if (!isRecord(value)) return false;
  const message = value as Partial<WorkerParentMessage>;
  return message.type === "run" && isValidDeliveryJob(message.job);
}

function isValidDeliveryJob(value: unknown): value is DeliveryJob {
  if (!isRecord(value)) return false;
  return isPositiveInteger(value.checkId) && isDeliveryHash(value.deliveryHash) && isValidPullRequestEvent(value.event);
}

function isValidPullRequestEvent(value: unknown): value is DeliveryJob["event"] {
  if (!isRecord(value)) return false;
  return isValidRepository(value.owner, value.repo) && isValidPullRequest(value) && isValidInstallation(value);
}

function isValidRepository(owner: unknown, repo: unknown): boolean {
  return typeof owner === "string" && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(owner) && isRepositoryName(repo);
}

function isRepositoryName(value: unknown): boolean {
  return typeof value === "string" && /^[A-Za-z0-9._][A-Za-z0-9._-]{0,99}$/u.test(value) && value !== "." && value !== "..";
}

function isValidPullRequest(value: Record<string, unknown>): boolean {
  return isPositiveInteger(value.prNumber) && isCommitSha(value.baseSha) && isCommitSha(value.headSha) && typeof value.isDraft === "boolean";
}

function isValidInstallation(value: Record<string, unknown>): boolean {
  return isPositiveInteger(value.installationId);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isDeliveryHash(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
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
