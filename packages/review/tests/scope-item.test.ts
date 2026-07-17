import { describe, it, expect } from "vitest";
import { checkScope } from "../src/scope.js";
import type { QueueItem } from "@aker-build/queue";

function item(over: Partial<QueueItem>): QueueItem {
  return {
    id: "Q-001",
    title: "t",
    status: "ready",
    type: "implementation",
    source: { evidence: [] },
    priority: "medium",
    risk: "medium",
    depends_on: [],
    lock_scope: { files: [] },
    allowed_files: [],
    forbidden_files: [],
    gates: [],
    validation: ["pnpm -r test"],
    stop_conditions: [],
    final_report: { required: [] },
    ...over,
  };
}

describe("scope check against a queue item (T024, SC-003)", () => {
  it("flags a changed file listed in forbidden_files", () => {
    const r = checkScope(["src/secrets.ts", "src/ok.ts"], item({ forbidden_files: ["src/secrets.ts"] }));
    expect(r.checked).toBe(true);
    expect(r.item_id).toBe("Q-001");
    expect(r.violations).toEqual([{ file: "src/secrets.ts", reason: "forbidden" }]);
  });

  it("flags a changed file outside a NON-EMPTY allowed_files", () => {
    const r = checkScope(["src/a.ts", "src/elsewhere.ts"], item({ allowed_files: ["src/a.ts"] }));
    expect(r.violations).toEqual([{ file: "src/elsewhere.ts", reason: "outside_allowed" }]);
  });

  it("allowed_files: [] means no allow-list constraint — only forbidden applies", () => {
    const r = checkScope(["anything.ts", "more.ts"], item({ allowed_files: [], forbidden_files: [] }));
    expect(r.violations).toEqual([]);
  });

  it("forbidden takes precedence and both rules can fire across files", () => {
    const r = checkScope(
      ["bad.ts", "stray.ts", "good.ts"],
      item({ allowed_files: ["good.ts"], forbidden_files: ["bad.ts"] }),
    );
    expect(r.violations).toEqual([
      { file: "bad.ts", reason: "forbidden" },
      { file: "stray.ts", reason: "outside_allowed" },
    ]);
  });
});
