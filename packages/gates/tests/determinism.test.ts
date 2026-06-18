import { describe, it, expect } from "vitest";
import { runGates } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T031 deterministic re-run (SC-005)", () => {
  it("two runs over unchanged input produce deep-equal risk lists", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const a = runGates(repoRoot, { out: outDir }).risks;
    const b = runGates(repoRoot, { out: outDir }).risks;
    expect(b).toEqual(a);
  });

  it("findings are stably ordered by gate_id then evidence", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });
    const keys = risks.findings.map((f) => `${f.gate_id} ${f.evidence[0]?.path ?? ""} ${f.evidence[0]?.signal ?? ""} ${f.status}`);
    expect([...keys]).toEqual([...keys].sort());
  });
});
