import { describe, it, expect } from "vitest";
import { routeQueue } from "../src/index.js";
import type { QueueItem, QueueContext } from "../src/index.js";
import { minimalMap, riskList } from "./helpers.js";

function item(id: string, lockFiles: string[], risk: QueueItem["risk"] = "low"): QueueItem {
  return {
    id,
    title: id,
    status: "ready",
    type: "implementation",
    source: { evidence: [{ type: "file", path: lockFiles[0] ?? `${id}.ts`, line: null, signal: "x", confidence: "low" }] },
    priority: "low",
    risk,
    depends_on: [],
    lock_scope: { files: lockFiles },
    allowed_files: lockFiles,
    forbidden_files: [],
    gates: ["TG-G1"],
    validation: ["pnpm -r test"],
    stop_conditions: ["tests fail"],
    final_report: { required: ["files changed"] },
    blocked_reason: null,
  };
}

const ctxWithDiff = (changedFiles: string[]): QueueContext => ({
  projectMap: minimalMap(),
  risks: riskList([]),
  repoRoot: ".",
  inputs: { changedFiles },
});

describe("T023 lock-scope overlap with current diff (US3)", () => {
  it("an item whose lock scope overlaps the diff is blocked; a non-overlapping item is chosen", () => {
    const items = [item("Q-001", ["a.ts"]), item("Q-002", ["b.ts"])];
    // Current diff touches a.ts → Q-001 overlaps and is blocked; Q-002 wins.
    const decision = routeQueue(items, ctxWithDiff(["a.ts"]));
    expect(decision.next!.id).toBe("Q-002");
    expect(decision.blocked.find((b) => b.id === "Q-001")?.reason).toMatch(/overlaps the current diff/);
  });

  it("with no diff, both items are selectable (overlap factor skipped)", () => {
    const items = [item("Q-001", ["a.ts"]), item("Q-002", ["b.ts"])];
    const decision = routeQueue(items, ctxWithDiff([]));
    expect(decision.next).not.toBeNull();
    expect(decision.blocked.length).toBe(0);
  });
});
