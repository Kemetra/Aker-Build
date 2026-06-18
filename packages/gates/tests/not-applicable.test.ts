import { describe, it, expect } from "vitest";
import { runGates } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T022 not-applicable (FR-005)", () => {
  it("the billing gate (TG-G6) is not_applicable with severity null when no billing surface exists", () => {
    const { repoRoot, outDir } = gatesFixture("nobilling");
    const { risks } = runGates(repoRoot, { out: outDir });

    const g6 = risks.findings.filter((f) => f.gate_id === "TG-G6");
    expect(g6.length).toBe(1);
    expect(g6[0]!.status).toBe("not_applicable");
    expect(g6[0]!.severity).toBeNull();
  });

  it("a not_applicable finding is never a failure/risk", () => {
    const { repoRoot, outDir } = gatesFixture("nobilling");
    const { risks } = runGates(repoRoot, { out: outDir });
    const na = risks.findings.filter((f) => f.status === "not_applicable");
    expect(na.every((f) => f.severity === null)).toBe(true);
  });
});
