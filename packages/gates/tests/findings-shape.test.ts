import { describe, it, expect } from "vitest";
import { runGates, validateRisks } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T009 findings-shape (SC-002)", () => {
  it("every finding cites gate_id + status; the whole list validates against risksSchema", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });

    expect(validateRisks(risks).ok).toBe(true);
    for (const f of risks.findings) {
      expect(typeof f.gate_id).toBe("string");
      expect(["risk", "needs_verification", "not_applicable"]).toContain(f.status);
    }
  });

  it("every risk finding cites a severity and >=1 evidence object; non-risk has severity null", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });

    for (const f of risks.findings) {
      if (f.status === "risk") {
        expect(["low", "medium", "high", "critical"]).toContain(f.severity);
        expect(f.evidence.length).toBeGreaterThanOrEqual(1);
      } else {
        expect(f.severity).toBeNull();
      }
    }
    // The vuln fixture must produce at least one real risk.
    expect(risks.findings.some((f) => f.status === "risk")).toBe(true);
  });
});
