import { describe, it, expect } from "vitest";
import { runGates } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T012 secret safety (SC-006, FR-009)", () => {
  it("flags secret-in-log as a finding but never copies the secret value into output", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });

    const secretFinding = risks.findings.find((f) =>
      f.evidence.some((e) => /secret-like value printed in logs/.test(e.signal)),
    );
    expect(secretFinding).toBeDefined();
    expect(secretFinding!.gate_id).toBe("TG-G4");

    // The fixture logs req.body.apiKey; the *value* must never appear, and the serialized
    // output must not leak anything beyond the pattern name.
    const serialized = JSON.stringify(risks);
    expect(serialized).not.toMatch(/req\.body\.apiKey/);
    // Only the signal name describes the pattern — no raw code line is copied.
    expect(serialized).toContain("secret-like value printed in logs");
  });
});
