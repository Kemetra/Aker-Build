import { describe, it, expect } from "vitest";
import { runGates } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T010 known-violation -> finding tied to the right gate w/ evidence (SC-001)", () => {
  it("flags the admin-route-without-role-guard as a TG-G4 risk with line evidence", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });

    const g4 = risks.findings.filter((f) => f.gate_id === "TG-G4" && f.status === "risk");
    expect(g4.length).toBeGreaterThan(0);

    const adminFinding = g4.find((f) =>
      f.evidence.some((e) => /admin route without a role guard/.test(e.signal)),
    );
    expect(adminFinding).toBeDefined();
    const ev = adminFinding!.evidence[0]!;
    expect(ev.path).toMatch(/admin\.ts$/);
    expect(ev.line).toBeTypeOf("number");
  });

  it("flags the frontend->backend import as a TG-G1 risk", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });
    const g1 = risks.findings.filter((f) => f.gate_id === "TG-G1" && f.status === "risk");
    expect(g1.length).toBeGreaterThan(0);
    expect(g1.some((f) => f.evidence.some((e) => /frontend imports backend/.test(e.signal)))).toBe(true);
  });

  it("flags the webhook-without-idempotency as a TG-G5 risk", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });
    const g5 = risks.findings.filter((f) => f.gate_id === "TG-G5" && f.status === "risk");
    expect(g5.length).toBeGreaterThan(0);
  });

  it("flags the destructive migration as a TG-G3 risk", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const { risks } = runGates(repoRoot, { out: outDir });
    const g3 = risks.findings.filter((f) => f.gate_id === "TG-G3" && f.status === "risk");
    expect(g3.some((f) => f.evidence.some((e) => /destructive migration/.test(e.signal)))).toBe(true);
  });
});
