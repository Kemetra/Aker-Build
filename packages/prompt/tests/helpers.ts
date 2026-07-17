import type { QueueItem } from "@aker-build/queue";

/** A fully-scoped, compilable QueueItem (sensible defaults; override per test). */
export function fullItem(overrides: Partial<QueueItem> = {}): QueueItem {
  return {
    id: "Q-001",
    title: "Fix: admin route without a role guard",
    status: "ready",
    type: "implementation",
    source: {
      evidence: [
        { type: "line", path: "apps/api/routes/admin.ts", line: 42, signal: "admin route without a role guard", confidence: "high" },
      ],
    },
    priority: "high",
    risk: "medium",
    depends_on: [],
    lock_scope: { files: ["apps/api/routes/admin.ts"] },
    allowed_files: ["apps/api/routes/admin.ts"],
    forbidden_files: [],
    gates: ["TG-G4"],
    validation: ["pnpm -r test", "pnpm -r typecheck"],
    stop_conditions: ["tests fail"],
    final_report: { required: ["Files changed", "Tests run and results"] },
    blocked_reason: null,
    ...overrides,
  };
}
