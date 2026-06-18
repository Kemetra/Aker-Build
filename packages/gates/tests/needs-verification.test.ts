import { describe, it, expect } from "vitest";
import { runGates } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("T021 needs-verification (SC-004)", () => {
  it("a diff-dependent gate (TG-G8) reports needs_verification, never a fabricated pass/fail", () => {
    // The vuln fixture has a manifest + lockfile (added at scan/install time is irrelevant; the
    // fixture itself has package.json). G8 can't assert drift without diff evidence in v0.
    const { repoRoot, outDir } = gatesFixture("clean");
    const { risks } = runGates(repoRoot, { out: outDir });

    const g8 = risks.findings.filter((f) => f.gate_id === "TG-G8");
    expect(g8.length).toBeGreaterThan(0);
    expect(g8.every((f) => f.status === "needs_verification" || f.status === "not_applicable")).toBe(true);

    for (const f of g8.filter((x) => x.status === "needs_verification")) {
      expect(f.severity).toBeNull();
      expect(f.evidence.length).toBeGreaterThanOrEqual(1);
    }
  });
});
