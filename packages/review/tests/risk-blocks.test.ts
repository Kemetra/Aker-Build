import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reviewLocalDiff } from "../src/review.js";
import type { Finding } from "../src/types.js";

const ev = (path: string, line: number, signal: string) => ({
  type: "line" as const,
  path,
  line,
  signal,
  confidence: "high" as const,
});

/** Inject a synthetic changed-files set + gate findings (R8: no full chain run). */
function deps(changed: string[], findings: Finding[]) {
  return {
    changedFiles: () => changed,
    runGates: () => ({ risks: { schema_version: 1, findings } }),
  };
}

describe("a diff-attributable risk finding → Not Ready naming the gate (T012, SC-002)", () => {
  it("verdict not_ready and the report names the failing gate id", () => {
    const findings: Finding[] = [
      { gate_id: "TG-G4", status: "risk", severity: "high", evidence: [ev("apps/api/routes/admin.ts", 12, "admin route without a role guard")] },
    ];
    const report = reviewLocalDiff(
      { out: ".tenantguard" },
      deps(["apps/api/routes/admin.ts"], findings),
    );
    expect(report.verdict).toBe("not_ready");
    expect(report.findings.some((f) => "gate_id" in f && f.gate_id === "TG-G4")).toBe(true);
  });

  it("a risk on an UNCHANGED file does not block (attribution gates the verdict)", () => {
    const findings: Finding[] = [
      { gate_id: "TG-G4", status: "risk", severity: "high", evidence: [ev("apps/api/routes/other.ts", 3, "unrelated")] },
    ];
    const report = reviewLocalDiff(
      { out: ".tenantguard" },
      deps(["apps/api/routes/admin.ts"], findings),
    );
    expect(report.verdict).toBe("ready");
    expect(report.findings).toHaveLength(0);
  });

  it("excluded changed files do not contribute findings or scope violations", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "tg-review-config-"));
    const configPath = join(repoRoot, "tenantguard.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ version: 1, paths: { exclude: ["apps/api/routes/admin.ts"] } }),
      "utf8",
    );
    const out = join(repoRoot, ".tenantguard");
    mkdirSync(out);
    writeFileSync(
      join(out, "queue.json"),
      JSON.stringify({
        items: [
          {
            id: "Q-001",
            allowed_files: [],
            forbidden_files: ["apps/api/routes/admin.ts"],
          },
        ],
      }),
      "utf8",
    );
    const findings: Finding[] = [
      { gate_id: "TG-G4", status: "risk", severity: "high", evidence: [ev("apps/api/routes/admin.ts", 12, "admin route without a role guard")] },
    ];

    const report = reviewLocalDiff(
      { out, item: "Q-001", configPath },
      deps(["apps/api/routes/admin.ts"], findings),
    );
    expect(report.changed_files).toEqual(["apps/api/routes/admin.ts"]);
    expect(report.verdict).toBe("ready");
    expect(report.findings).toHaveLength(0);
    expect(report.scope.violations).toHaveLength(0);
  });
});
