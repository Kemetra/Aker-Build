export type RuntimeLogEvent = "delivery_accepted" | "delivery_completed" | "delivery_rejected" | "cleanup";
export type RuntimeOutcome = "success" | "failure" | "neutral" | "timeout" | "rejected";

export interface RuntimeLogRecord {
  event: RuntimeLogEvent;
  deliveryHash?: string;
  owner?: string;
  repo?: string;
  prNumber?: number;
  outcome?: RuntimeOutcome;
  durationMs?: number;
  count?: number;
}

export function createStructuredLogger(write: (line: string) => void = (line) => process.stdout.write(`${line}\n`)) {
  return {
    log(input: RuntimeLogRecord): void {
      const output: Partial<RuntimeLogRecord> = { event: input.event };
      if (typeof input.deliveryHash === "string" && /^[0-9a-f]{16}$/u.test(input.deliveryHash)) {
        output.deliveryHash = input.deliveryHash;
      }
      if (typeof input.owner === "string") output.owner = input.owner;
      if (typeof input.repo === "string") output.repo = input.repo;
      if (Number.isSafeInteger(input.prNumber) && (input.prNumber ?? 0) > 0) output.prNumber = input.prNumber;
      if (typeof input.outcome === "string") output.outcome = input.outcome;
      if (Number.isFinite(input.durationMs) && (input.durationMs ?? -1) >= 0) output.durationMs = input.durationMs;
      if (Number.isFinite(input.count) && (input.count ?? -1) >= 0) output.count = input.count;
      write(JSON.stringify(output));
    },
  };
}
