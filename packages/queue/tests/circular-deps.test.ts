import { describe, it, expect } from "vitest";
import { detectCycles, routeQueue } from "../src/index.js";
import type { QueueItem, QueueContext } from "../src/index.js";
import { minimalMap, riskList } from "./helpers.js";

function item(id: string, depends_on: string[]): QueueItem {
  return {
    id,
    title: id,
    status: "ready",
    type: "implementation",
    source: { evidence: [{ type: "file", path: `${id}.ts`, line: null, signal: "x", confidence: "low" }] },
    priority: "low",
    risk: "low",
    depends_on,
    lock_scope: { files: [`${id}.ts`] },
    allowed_files: [`${id}.ts`],
    forbidden_files: [],
    gates: ["TG-G1"],
    validation: ["pnpm -r test"],
    stop_conditions: ["tests fail"],
    final_report: { required: ["files changed"] },
    blocked_reason: null,
  };
}

const ctx = (): QueueContext => ({
  projectMap: minimalMap(),
  risks: riskList([]),
  repoRoot: ".",
  inputs: { changedFiles: [] },
});

describe("T019 circular dependencies (SC-006)", () => {
  it("detectCycles flags both nodes in a 2-cycle with a description", () => {
    const items = [item("Q-001", ["Q-002"]), item("Q-002", ["Q-001"])];
    const cycles = detectCycles(items);
    expect(cycles.has("Q-001")).toBe(true);
    expect(cycles.has("Q-002")).toBe(true);
    expect(cycles.get("Q-001")).toMatch(/circular dependency/);
  });

  it("routing reports circular items as blocked and does not loop", () => {
    const items = [item("Q-001", ["Q-002"]), item("Q-002", ["Q-001"])];
    const decision = routeQueue(items, ctx());
    expect(decision.next).toBeNull();
    const reasons = decision.blocked.map((b) => b.reason).join(" ");
    expect(reasons).toMatch(/circular dependency/);
  });

  it("an acyclic graph has no cycles", () => {
    const items = [item("Q-001", []), item("Q-002", ["Q-001"])];
    expect(detectCycles(items).size).toBe(0);
  });
});
