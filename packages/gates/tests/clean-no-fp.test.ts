import { describe, it, expect } from "vitest";
import { runGates } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T023 clean repo -> 0 false-positive risk findings (SC-003)", () => {
  it("TG-G4 produces no risk findings on a repo where every route is guarded", () => {
    const { repoRoot, outDir } = gatesFixture("clean");
    const { risks } = runGates(repoRoot, { out: outDir });

    const g4Risks = risks.findings.filter((f) => f.gate_id === "TG-G4" && f.status === "risk");
    expect(g4Risks.length).toBe(0);
  });

  it("the clean fixture yields zero risk findings for boundary/idempotency/migration gates", () => {
    const { repoRoot, outDir } = gatesFixture("clean");
    const { risks } = runGates(repoRoot, { out: outDir });
    for (const gate of ["TG-G1", "TG-G3", "TG-G5"]) {
      const risksForGate = risks.findings.filter((f) => f.gate_id === gate && f.status === "risk");
      expect(risksForGate, `${gate} should have no risk findings on the clean fixture`).toEqual([]);
    }
  });
});
