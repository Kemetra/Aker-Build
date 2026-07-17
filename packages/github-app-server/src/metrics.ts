export const METRIC_NAMES = [
  "intake_total",
  "accepted_total",
  "duplicate_total",
  "queue_rejected_total",
  "processing_total",
  "outcome_success_total",
  "outcome_failure_total",
  "outcome_neutral_total",
  "timeout_total",
  "budget_exhaustion_total",
  "github_retry_total",
  "workspace_cleanup_failure_total",
  "queue_depth",
  "active_workers",
] as const;

export type MetricName = (typeof METRIC_NAMES)[number];
type MetricSnapshot = Record<MetricName, number>;

const ALLOWED = new Set<string>(METRIC_NAMES);
const GAUGES = new Set<MetricName>(["queue_depth", "active_workers"]);

export class RuntimeMetrics {
  readonly #values = Object.fromEntries(METRIC_NAMES.map((name) => [name, 0])) as MetricSnapshot;

  increment(name: MetricName, amount = 1): void {
    this.#assertName(name);
    if (GAUGES.has(name)) throw new Error("metric is a gauge");
    if (!Number.isFinite(amount) || amount < 0) throw new Error("metric increment is invalid");
    this.#values[name] += amount;
  }

  set(name: Extract<MetricName, "queue_depth" | "active_workers">, value: number): void {
    this.#assertName(name);
    if (!GAUGES.has(name) || !Number.isFinite(value) || value < 0) throw new Error("metric gauge is invalid");
    this.#values[name] = value;
  }

  snapshot(): MetricSnapshot {
    return { ...this.#values };
  }

  #assertName(name: string): asserts name is MetricName {
    if (!ALLOWED.has(name)) throw new Error("unknown metric name");
  }
}
