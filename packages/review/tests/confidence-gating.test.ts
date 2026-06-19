import { describe, it, expect } from "vitest";
import { reviewLocalDiff } from "../src/review.js";
import type { Finding } from "../src/types.js";

const ev = (path: string, signal: string, confidence: "high" | "medium" | "low") => ({
  type: "line" as const,
  path,
  line: 1,
  signal,
  confidence,
});

function deps(changed: string[], findings: Finding[]) {
  return {
    changedFiles: () => changed,
    runGates: () => ({ risks: { schema_version: 1, findings } }),
  };
}

const FILE = "apps/api/routes.ts";

describe("P2: only confirmed findings flip the PR verdict", () => {
  it("a confirmed (high-confidence) risk → not_ready", () => {
    const findings: Finding[] = [
      { gate_id: "TG-G4", status: "risk", severity: "high", evidence: [ev(FILE, "route without auth guard", "high")] },
    ];
    const report = reviewLocalDiff({ out: ".tenantguard" }, deps([FILE], findings));
    expect(report.verdict).toBe("not_ready");
  });

  it("a suspected (medium-only) risk does NOT block — surfaced as needs_verification, not ready", () => {
    const findings: Finding[] = [
      { gate_id: "TG-G4", status: "risk", severity: "high", evidence: [ev(FILE, "route maybe behind middleware", "medium")] },
    ];
    const report = reviewLocalDiff({ out: ".tenantguard" }, deps([FILE], findings));
    expect(report.verdict).toBe("needs_verification");
    // still visible in the report, just not blocking
    expect(report.findings.some((f) => "gate_id" in f && f.gate_id === "TG-G4")).toBe(true);
  });

  it("no findings → ready", () => {
    const report = reviewLocalDiff({ out: ".tenantguard" }, deps([FILE], []));
    expect(report.verdict).toBe("ready");
  });
});
