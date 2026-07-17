import { describe, expect, it } from "vitest";
import type { ComparedGateFinding, ScopeResult } from "../src/types.js";
import { decideComparisonVerdict } from "../src/verdict.js";

const noScope: ScopeResult = { checked: false, violations: [] };

function finding(overrides: Partial<ComparedGateFinding> = {}): ComparedGateFinding {
  return {
    gate_id: "TG-G4",
    status: "risk",
    severity: "high",
    evidence: [{ type: "line", path: "src/access.ts", line: 7, signal: "risk", confidence: "high" }],
    classification: "new",
    fingerprint: "a".repeat(64),
    source: "head",
    line_changed: true,
    ...overrides,
  } as ComparedGateFinding;
}

describe("comparison-driven verdict", () => {
  it("does not block on existing debt, resolved findings, or improvements", () => {
    expect(decideComparisonVerdict([
      finding({ classification: "existing" }),
      finding({ classification: "resolved", source: "base", line_changed: false }),
      finding({ classification: "changed", change: "improved", line_changed: true }),
    ], noScope, true)).toBe("ready");
  });

  it("blocks only an unsuppressed confirmed introduced or worsened risk", () => {
    expect(decideComparisonVerdict([finding()], noScope, true)).toBe("not_ready");
    expect(decideComparisonVerdict([
      finding({ classification: "changed", change: "worsened" }),
    ], noScope, true)).toBe("not_ready");
    expect(decideComparisonVerdict([
      finding({ suppression: { id: "x", reason: "accepted", owner: "security", matched_by: "path" } }),
    ], noScope, true)).toBe("ready");
  });

  it("requires verification for suspected/new, needs-verification, unattributed, or incomplete comparisons", () => {
    expect(decideComparisonVerdict([
      finding({ evidence: [{ type: "line", path: "src/access.ts", line: 7, signal: "risk", confidence: "medium" }] }),
    ], noScope, true)).toBe("needs_verification");
    expect(decideComparisonVerdict([
      finding({ status: "needs_verification", severity: null }),
    ], noScope, true)).toBe("needs_verification");
    expect(decideComparisonVerdict([
      finding({ classification: "unattributed", line_changed: false }),
    ], noScope, true)).toBe("needs_verification");
    expect(decideComparisonVerdict([], noScope, false)).toBe("needs_verification");
  });

  it("keeps scope violations not ready even when comparison evidence is incomplete", () => {
    const scope: ScopeResult = {
      checked: true,
      item_id: "Q-001",
      violations: [{ file: "src/access.ts", reason: "forbidden" }],
    };
    expect(decideComparisonVerdict([], scope, false)).toBe("not_ready");
  });

  it("never promotes a confirmed risk to not_ready on an incomplete comparison", () => {
    expect(decideComparisonVerdict([finding()], noScope, false)).toBe("needs_verification");
    expect(decideComparisonVerdict([
      finding({ classification: "changed", change: "worsened" }),
    ], noScope, false)).toBe("needs_verification");
  });
});
