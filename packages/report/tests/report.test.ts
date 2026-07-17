import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { buildReport, renderReportMarkdown, validateReport, writeReportToFiles } from "../src/index.js";

function tempRepo(): { repoRoot: string; outDir: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), "tg-report-repo-"));
  const outDir = join(repoRoot, ".aker-build");
  mkdirSync(outDir, { recursive: true });
  return { repoRoot, outDir };
}

function writeJson(outDir: string, name: string, value: unknown): void {
  writeFileSync(join(outDir, name), JSON.stringify(value, null, 2), "utf8");
}

function seedProjectMap(outDir: string): void {
  writeJson(outDir, "project-map.json", {
    version: 1,
    project: {
      name: "demo-saas",
      detected_stack: { runtime: "node", package_manager: "pnpm", frameworks: ["express"] },
    },
    repos: [{ name: "api", path: "apps/api", type: "backend", owns: ["api_routes"] }],
    boundaries: [],
    tenant_model: { status: "detected", strategy: "shared-db", tenant_key: "tenant_id", required_surfaces: ["api_routes"] },
    critical_surfaces: ["api_routes"],
  });
}

function seedRisks(outDir: string): void {
  writeJson(outDir, "risks.json", {
    schema_version: 1,
    findings: [
      {
        gate_id: "TG-G4",
        status: "risk",
        severity: "high",
        evidence: [{ type: "line", path: "apps/api/routes/admin.ts", line: 4, signal: "admin route without role guard", confidence: "high" }],
        suppression: {
          id: "TG-G4-DEMO-001",
          reason: "Known demo fixture.",
          owner: "maintainer",
          matched_by: "path",
        },
      },
      {
        gate_id: "TG-G9",
        status: "needs_verification",
        severity: null,
        evidence: [{ type: "missing_artifact", path: null, signal: "no CI configuration found", confidence: "low" }],
      },
    ],
  });
}

function seedQueueAndRoute(outDir: string): void {
  writeJson(outDir, "queue.json", {
    schema_version: 1,
    items: [
      {
        id: "Q-001",
        title: "Verify: no CI configuration found",
        status: "blocked",
        type: "chore",
        source: { evidence: [{ type: "missing_artifact", path: null, signal: "no CI configuration found", confidence: "low" }] },
        priority: "low",
        risk: "low",
        depends_on: [],
        lock_scope: { files: [] },
        allowed_files: [],
        forbidden_files: [],
        gates: ["TG-G9"],
        validation: ["pnpm test"],
        stop_conditions: [],
        final_report: { required: ["Files changed"] },
      },
    ],
  });
  writeJson(outDir, "route.json", {
    next: null,
    blocked: [{ id: "Q-001", reason: "blocked" }],
    no_safe_task_reasons: ["all 1 item(s) are blocked"],
  });
}

function seedReview(outDir: string): void {
  writeJson(outDir, "review.json", {
    schema_version: 1,
    mode: "local-diff",
    verdict: "needs_verification",
    changed_files: ["apps/api/routes/admin.ts"],
    findings: [],
    scope: { checked: false, violations: [] },
    github_available: null,
  });
}

describe("Aker Build report", () => {
  it("summarizes a full artifact set into valid JSON and Markdown", () => {
    const { repoRoot, outDir } = tempRepo();
    seedProjectMap(outDir);
    seedRisks(outDir);
    seedQueueAndRoute(outDir);
    seedReview(outDir);
    mkdirSync(join(repoRoot, ".specify", "memory"), { recursive: true });
    writeFileSync(join(repoRoot, ".specify", "memory", "constitution.md"), "# Constitution\n", "utf8");

    const report = buildReport(repoRoot, { out: outDir });
    expect(validateReport(report).ok).toBe(true);
    expect(report.summary.project_name).toBe("demo-saas");
    expect(report.summary.findings.risk).toBe(1);
    expect(report.summary.findings.suppressed).toBe(1);
    expect(report.summary.queue.blocked).toBe(1);
    expect(report.summary.review?.verdict).toBe("needs_verification");
    expect(report.spec_kit.present).toBe(true);

    const markdown = renderReportMarkdown(report);
    expect(markdown).toContain("# Aker Build Report");
    expect(markdown).toContain("TG-G4-DEMO-001");
    expect(markdown).toContain("Spec Kit artifacts: 1");
  });

  it("lists missing artifacts without failing", () => {
    const { repoRoot, outDir } = tempRepo();
    seedProjectMap(outDir);

    const report = buildReport(repoRoot, { out: outDir });
    expect(validateReport(report).ok).toBe(true);
    expect(report.artifacts.missing).toEqual(["risks.json", "queue.json", "route.json", "review.json"]);
    expect(report.summary.findings.total).toBe(0);
    expect(renderReportMarkdown(report)).toContain("Missing artifacts");
  });

  it("keeps suppressions visible and never copies secret-looking values", () => {
    const { repoRoot, outDir } = tempRepo();
    seedProjectMap(outDir);
    seedRisks(outDir);
    writeFileSync(join(repoRoot, "aker-build.config.json"), JSON.stringify({ version: 1, token: "0123456789abcdef0123456789abcdef" }), "utf8");
    mkdirSync(join(repoRoot, "specs", "012-demo"), { recursive: true });
    writeFileSync(join(repoRoot, "specs", "012-demo", "spec.md"), "api_key = '0123456789abcdef0123456789abcdef'\n", "utf8");

    const report = buildReport(repoRoot, { out: outDir });
    const serialized = JSON.stringify(report) + renderReportMarkdown(report);
    expect(report.config.error).toContain("secret-like content");
    expect(report.suppressions[0]?.id).toBe("TG-G4-DEMO-001");
    expect(serialized).not.toContain("0123456789abcdef");
  });

  it("writes report JSON and Markdown files", () => {
    const { repoRoot, outDir } = tempRepo();
    seedProjectMap(outDir);
    const { jsonPath, mdPath, report } = writeReportToFiles(repoRoot, { out: outDir });

    expect(JSON.parse(readFileSync(jsonPath, "utf8")).schema_version).toBe(1);
    expect(readFileSync(mdPath, "utf8")).toContain("# Aker Build Report");
    expect(report.artifacts.present).toContain("project-map.json");
  });
});
