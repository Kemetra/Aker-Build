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
      write(JSON.stringify(sanitize(input)));
    },
  };
}

function sanitize(input: RuntimeLogRecord): Partial<RuntimeLogRecord> {
  const output: Partial<RuntimeLogRecord> = { event: input.event };
  addDeliveryHash(output, input.deliveryHash);
  addText(output, "owner", input.owner);
  addText(output, "repo", input.repo);
  addPositiveInteger(output, "prNumber", input.prNumber);
  addOutcome(output, input.outcome);
  addNonNegativeNumber(output, "durationMs", input.durationMs);
  addNonNegativeNumber(output, "count", input.count);
  return output;
}

function addDeliveryHash(output: Partial<RuntimeLogRecord>, value: string | undefined): void {
  if (typeof value === "string" && /^[0-9a-f]{16}$/u.test(value)) output.deliveryHash = value;
}

function addText(output: Partial<RuntimeLogRecord>, key: "owner" | "repo", value: string | undefined): void {
  if (typeof value === "string") output[key] = value;
}

function addOutcome(output: Partial<RuntimeLogRecord>, value: RuntimeOutcome | undefined): void {
  if (typeof value === "string") output.outcome = value;
}

function addPositiveInteger(output: Partial<RuntimeLogRecord>, key: "prNumber", value: number | undefined): void {
  if (Number.isSafeInteger(value) && (value ?? 0) > 0) output[key] = value;
}

function addNonNegativeNumber(output: Partial<RuntimeLogRecord>, key: "durationMs" | "count", value: number | undefined): void {
  if (Number.isFinite(value) && (value ?? -1) >= 0) output[key] = value;
}
