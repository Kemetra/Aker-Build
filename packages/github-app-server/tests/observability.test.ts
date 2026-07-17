import { describe, expect, it } from "vitest";
import { RuntimeMetrics } from "../src/metrics.js";
import { createStructuredLogger } from "../src/structured-log.js";

describe("allowlisted runtime observability", () => {
  it("exports only fixed numeric metric names", () => {
    const metrics = new RuntimeMetrics();
    metrics.increment("intake_total");
    metrics.increment("github_retry_total", 2);
    metrics.set("queue_depth", 3);
    const snapshot = metrics.snapshot();
    expect(snapshot).toMatchObject({ intake_total: 1, github_retry_total: 2, queue_depth: 3 });
    expect(Object.values(snapshot).every((value) => typeof value === "number" && Number.isFinite(value))).toBe(true);
    expect(() => (metrics.increment as (name: string) => void)("secret_metric_name")).toThrow(/metric/i);
  });

  it("serializes only approved log fields and drops arbitrary exception/source data", () => {
    const lines: string[] = [];
    const logger = createStructuredLogger((line) => lines.push(line));
    logger.log({
      event: "delivery_completed",
      deliveryHash: "0123456789abcdef",
      owner: "org",
      repo: "repo",
      prNumber: 4,
      outcome: "success",
      durationMs: 12,
      count: 3,
      rawError: "PRIVATE_LOG_SENTINEL",
      source: "SOURCE_SENTINEL",
    } as never);
    expect(lines).toHaveLength(1);
    const line = lines[0] ?? "";
    expect(line).not.toContain("PRIVATE_LOG_SENTINEL");
    expect(line).not.toContain("SOURCE_SENTINEL");
    expect(JSON.parse(line)).toEqual({
      event: "delivery_completed",
      deliveryHash: "0123456789abcdef",
      owner: "org",
      repo: "repo",
      prNumber: 4,
      outcome: "success",
      durationMs: 12,
      count: 3,
    });
  });
});
