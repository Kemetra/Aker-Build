import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { runReportCommand } from "../src/commands/report.js";

const created: string[] = [];
afterEach(() => {
  for (const p of created) if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  created.length = 0;
});

function tempRun(): { repoRoot: string; outDir: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), "tg-cli-report-"));
  const outDir = join(repoRoot, ".tenantguard");
  mkdirSync(outDir, { recursive: true });
  created.push(repoRoot);
  writeFileSync(
    join(outDir, "project-map.json"),
    JSON.stringify({
      version: 1,
      project: { name: "cli-demo", detected_stack: { runtime: "node", package_manager: "pnpm", frameworks: [] } },
      repos: [],
      boundaries: [],
      tenant_model: { status: "unknown", strategy: null, tenant_key: null, required_surfaces: [] },
      critical_surfaces: [],
    }),
    "utf8",
  );
  return { repoRoot, outDir };
}

describe("`tenantguard report` command", () => {
  it("writes tenantguard-report.json and tenantguard-report.md", () => {
    const { repoRoot, outDir } = tempRun();
    const lines: string[] = [];
    const code = runReportCommand(repoRoot, { out: outDir, errSink: (line) => lines.push(line) });

    expect(code).toBe(0);
    expect(existsSync(resolve(outDir, "tenantguard-report.json"))).toBe(true);
    expect(existsSync(resolve(outDir, "tenantguard-report.md"))).toBe(true);
    expect(lines.join("\n")).toContain("Wrote");
  });

  it("prints Markdown to stdout when requested", () => {
    const { repoRoot, outDir } = tempRun();
    const lines: string[] = [];
    const code = runReportCommand(repoRoot, { out: outDir, stdout: true, format: "md", sink: (line) => lines.push(line), errSink: () => {} });

    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("# TenantGuard Report");
  });

  it("prints JSON to stdout when requested", () => {
    const { repoRoot, outDir } = tempRun();
    const lines: string[] = [];
    const code = runReportCommand(repoRoot, { out: outDir, stdout: true, format: "json", sink: (line) => lines.push(line), errSink: () => {} });

    expect(code).toBe(0);
    expect(JSON.parse(lines.join("\n")).summary.project_name).toBe("cli-demo");
  });

  it("writes readable missing-artifact output", () => {
    const { repoRoot, outDir } = tempRun();
    const code = runReportCommand(repoRoot, { out: outDir, errSink: () => {} });
    const report = JSON.parse(readFileSync(resolve(outDir, "tenantguard-report.json"), "utf8"));

    expect(code).toBe(0);
    expect(report.artifacts.missing).toContain("risks.json");
  });
});
