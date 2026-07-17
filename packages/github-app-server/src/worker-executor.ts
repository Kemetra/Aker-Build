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
  once(event: "error", listener: (error: Error) => void): this;
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
      const finish = this.#makeFinisher(job, child, resolve);
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        void finish("worker_timeout");
      }, this.#timeoutMs);
      const settle = wrapWithTimerClear(finish, timer);

      this.#active.set(child, { finish: settle });
      wireChildEvents(child, settle);
      this.#dispatch(child, job, settle);
    });
  }

  #makeFinisher(
    job: DeliveryJob,
    child: WorkerChild,
    resolve: (result: WorkerExecutionResult) => void,
  ): (reason: IncompleteReason | null, message?: WorkerResultMessage) => Promise<void> {
    let settled = false;
    return async (reason, message) => {
      if (settled) return;
      settled = true;
      child.removeAllListeners();
      this.#active.delete(child);
      if (reason) await this.#neutralize(job, reason);
      resolve(executionResult(reason, message));
    };
  }

  async #neutralize(job: DeliveryJob, reason: IncompleteReason): Promise<void> {
    try {
      await this.#completeNeutral(job, reason);
    } catch {
      // A failed final Checks update cannot be made safe by exposing or retrying arbitrary data.
    }
  }

  #dispatch(child: WorkerChild, job: DeliveryJob, finish: Finish): void {
    try {
      if (!child.send({ type: "run", job })) killAndCrash(child, finish);
    } catch {
      killAndCrash(child, finish);
    }
  }

  async #neutralizeWithoutChild(
    job: DeliveryJob,
    reason: IncompleteReason,
  ): Promise<WorkerExecutionResult> {
    await this.#neutralize(job, reason);
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

type Finish = (reason: IncompleteReason | null, message?: WorkerResultMessage) => Promise<void>;

/** Wraps `finish` so the pending timeout is always cleared, whichever path settles the promise first. */
function wrapWithTimerClear(finish: Finish, timer: ReturnType<typeof setTimeout>): Finish {
  return (reason, message) => {
    clearTimeout(timer);
    return finish(reason, message);
  };
}

function killAndCrash(child: WorkerChild, finish: Finish): void {
  child.kill("SIGKILL");
  void finish("worker_crashed");
}

/**
 * A spawn error event with no listener is an unhandled EventEmitter error and crashes the parent
 * process; registering `error` alongside `message`/`exit` neutralizes the check instead.
 */
function wireChildEvents(child: WorkerChild, finish: Finish): void {
  child.once("message", (message) => {
    if (!isWorkerResult(message)) return killAndCrash(child, finish);
    void finish(message.code === "worker_failed" ? "worker_crashed" : null, message);
  });
  child.once("exit", () => void finish("worker_crashed"));
  child.once("error", () => void finish("worker_crashed"));
}

function executionResult(
  reason: IncompleteReason | null,
  message: WorkerResultMessage | undefined,
): WorkerExecutionResult {
  return {
    code: reason ?? message?.incompleteReason ??
      (message?.code === "worker_failed" || !message ? "worker_crashed" : message.code),
    usage: message?.usage ?? EMPTY_USAGE,
    githubRetries: message?.githubRetries ?? 0,
  };
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
  if (!isRecord(value)) return false;
  const message = value as Partial<WorkerResultMessage>;
  return message.type === "result" && isWorkerOutcome(message.code) && hasValidResultDetails(message);
}

function isWorkerOutcome(value: unknown): value is WorkerOutcomeCode {
  return value === "success" || value === "failure" || value === "neutral" || value === "worker_failed";
}

function hasValidResultDetails(message: Partial<WorkerResultMessage>): boolean {
  return isCount(message.githubRetries) && hasValidIncompleteReason(message) && isScanUsage(message.usage);
}

function hasValidIncompleteReason(message: Partial<WorkerResultMessage>): boolean {
  if (message.incompleteReason === undefined) return true;
  if (message.code !== "neutral") return false;
  return INCOMPLETE_REASONS.has(message.incompleteReason);
}

function isScanUsage(value: unknown): value is ScanUsage {
  if (!isRecord(value)) return false;
  return isCount(value.filesConsidered) && isCount(value.filesRead) && isCount(value.bytesRead);
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
