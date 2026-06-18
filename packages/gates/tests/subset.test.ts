import { describe, it, expect } from "vitest";
import { runGates, UnknownGateError } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T030 subset selection (FR-006)", () => {
  it("--gates TG-G4,TG-G5 runs only the named gates", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir, gates: ["TG-G4", "TG-G5"] });

    const ids = new Set(risks.findings.map((f) => f.gate_id));
    expect([...ids].sort()).toEqual(["TG-G4", "TG-G5"]);
  });

  it("an unknown gate id throws UnknownGateError", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    expect(() => runGates(repoRoot, { out: outDir, gates: ["TG-G99"] })).toThrow(UnknownGateError);
  });
});
