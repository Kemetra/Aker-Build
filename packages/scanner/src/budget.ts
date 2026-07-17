import { AsyncLocalStorage } from "node:async_hooks";

export interface ScanBudget {
  maxFiles: number;
  maxFileBytes: number;
  maxTotalBytes: number;
}

export interface ScanUsage {
  filesConsidered: number;
  filesRead: number;
  bytesRead: number;
}

export type ScanBudgetReason = "file_count" | "file_bytes" | "total_bytes";

export const UNBOUNDED_SCAN_BUDGET: Readonly<ScanBudget> = Object.freeze({
  maxFiles: Number.POSITIVE_INFINITY,
  maxFileBytes: Number.POSITIVE_INFINITY,
  maxTotalBytes: Number.POSITIVE_INFINITY,
});

export class ScanBudgetExceededError extends Error {
  constructor(public readonly reason: ScanBudgetReason) {
    super(`scan budget exceeded: ${reason}`);
    this.name = "ScanBudgetExceededError";
  }
}

export class ScanBudgetTracker {
  readonly #seen = new Set<string>();
  #filesRead = 0;
  #bytesRead = 0;

  constructor(public readonly budget: Readonly<ScanBudget>) {}

  consider(path: string): void {
    if (this.#seen.has(path)) return;
    this.#seen.add(path);
    if (this.#seen.size > this.budget.maxFiles) {
      throw new ScanBudgetExceededError("file_count");
    }
  }

  assertReadable(size: number): void {
    if (size > this.budget.maxFileBytes) {
      throw new ScanBudgetExceededError("file_bytes");
    }
    if (this.#bytesRead + size > this.budget.maxTotalBytes) {
      throw new ScanBudgetExceededError("total_bytes");
    }
  }

  recordRead(size: number): void {
    this.assertReadable(size);
    this.#filesRead += 1;
    this.#bytesRead += size;
  }

  snapshot(): ScanUsage {
    return {
      filesConsidered: this.#seen.size,
      filesRead: this.#filesRead,
      bytesRead: this.#bytesRead,
    };
  }
}

const storage = new AsyncLocalStorage<ScanBudgetTracker>();

export function runWithScanBudget<T>(tracker: ScanBudgetTracker, operation: () => T): T {
  return storage.run(tracker, operation);
}

export function activeScanBudget(): ScanBudgetTracker | undefined {
  return storage.getStore();
}
