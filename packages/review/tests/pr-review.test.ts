import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { reviewPr } from "../src/pr.js";
import type { Finding } from "../src/types.js";

const ev = (path: string, line: number, signal: string) => ({
  type: "line" as const, path, line, signal, confidence: "high" as const,
});

const META = () => ({ title: "Add admin route", state: "OPEN", baseRefName: "main" });

describe("PR review reuses the attribute→verdict core over PR changed files (T031, FR-005)", () => {
  it("a migration-safety risk on a PR-changed file yields Not Ready naming the gate", () => {
    const findings: Finding[] = [
      { gate_id: "TG-G3", status: "risk", severity: "critical", evidence: [ev("migrations/001_drop.sql", 1, "destructive migration")] },
    ];
    const report = reviewPr(42, {}, {
      prChangedFiles: () => ["migrations/001_drop.sql"],
      prMetadata: META,
      runGates: () => ({ risks: { schema_version: 1, findings } }),
      repoRoot: ".",
    });
    expect(report.mode).toBe("pr");
    expect(report.github_available).toBe(true);
    expect(report.verdict).toBe("not_ready");
    expect(report.findings.some((f) => "gate_id" in f && f.gate_id === "TG-G3")).toBe(true);
  });

  it("surfaces PR metadata as evidence alongside changed files (FR-005)", () => {
    const report = reviewPr(7, {}, {
      prChangedFiles: () => ["src/a.ts"],
      prMetadata: META,
      runGates: () => ({ risks: { schema_version: 1, findings: [] } }),
      repoRoot: ".",
    });
    expect(report.pr).toEqual({ number: 7, title: "Add admin route", state: "OPEN", base_ref: "main" });
  });

  it("a risk on a file NOT in the PR does not drive the verdict (attribution)", () => {
    const findings: Finding[] = [
      { gate_id: "TG-G3", status: "risk", severity: "high", evidence: [ev("other.sql", 2, "unrelated")] },
    ];
    const report = reviewPr(42, {}, {
      prChangedFiles: () => ["migrations/001_drop.sql"],
      prMetadata: META,
      runGates: () => ({ risks: { schema_version: 1, findings } }),
      repoRoot: ".",
    });
    expect(report.verdict).toBe("ready");
  });

  it("keeps excluded PR files visible while ignoring them for attribution", () => {
    const repoRoot = mkdtempSync(join(tmpdir(), "tg-pr-config-"));
    const configPath = join(repoRoot, "tenantguard.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ version: 1, paths: { exclude: ["apps/api/routes/admin.ts"] } }),
      "utf8",
    );
    const findings: Finding[] = [
      { gate_id: "TG-G4", status: "risk", severity: "high", evidence: [ev("apps/api/routes/admin.ts", 12, "unguarded admin")] },
    ];

    const report = reviewPr(42, { configPath }, {
      prChangedFiles: () => ["apps/api/routes/admin.ts"],
      prMetadata: META,
      runGates: () => ({ risks: { schema_version: 1, findings } }),
      repoRoot,
    });

    expect(report.changed_files).toEqual(["apps/api/routes/admin.ts"]);
    expect(report.verdict).toBe("ready");
    expect(report.findings).toHaveLength(0);
  });
});
