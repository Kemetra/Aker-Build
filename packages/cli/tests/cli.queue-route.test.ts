import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { validateQueue, validateRouteDecision } from "@tenantguard/queue";
import { runQueueCommand } from "../src/commands/queue.js";
import { runRouteCommand } from "../src/commands/route.js";

const MAP = {
  version: 1,
  project: { name: "fx", detected_stack: { runtime: null, package_manager: null, frameworks: [] } },
  repos: [],
  boundaries: [],
  tenant_model: { status: "not_detected", strategy: null, tenant_key: null, required_surfaces: [] },
  critical_surfaces: [],
};
const RISKS = {
  schema_version: 1,
  findings: [
    { gate_id: "TG-G4", status: "risk", severity: "high", evidence: [{ type: "line", path: "a.ts", line: 1, signal: "route without auth guard", confidence: "high" }] },
  ],
};

/** Fresh temp git repo with map + risks; optionally omit one to test "run X first". */
function repo(opts: { withMap?: boolean; withRisks?: boolean } = {}): { repoRoot: string; outDir: string } {
  const repoRoot = join(mkdtempSync(join(tmpdir(), "tg-cli-qr-")), "repo");
  mkdirSync(repoRoot, { recursive: true });
  const git = (...a: string[]) => execFileSync("git", a, { cwd: repoRoot, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "t@t.t");
  git("config", "user.name", "t");
  const outDir = join(repoRoot, ".tenantguard");
  mkdirSync(outDir, { recursive: true });
  if (opts.withMap !== false) writeFileSync(join(outDir, "project-map.json"), JSON.stringify(MAP), "utf8");
  if (opts.withRisks !== false) writeFileSync(join(outDir, "risks.json"), JSON.stringify(RISKS), "utf8");
  return { repoRoot, outDir };
}

const created: string[] = [];
afterEach(() => {
  for (const p of created) if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  created.length = 0;
});

describe("T027 `tenantguard queue` / `route` commands", () => {
  it("queue produces a valid queue.json and exits 0", () => {
    const { repoRoot, outDir } = repo();
    created.push(repoRoot);
    const code = runQueueCommand(repoRoot, { out: outDir, errSink: () => {} });
    expect(code).toBe(0);
    const file = join(outDir, "queue.json");
    expect(existsSync(file)).toBe(true);
    expect(validateQueue(JSON.parse(readFileSync(file, "utf8"))).ok).toBe(true);
  });

  it("queue exits 1 with 'run gates first' when risks.json is missing", () => {
    const { repoRoot, outDir } = repo({ withRisks: false });
    created.push(repoRoot);
    const lines: string[] = [];
    const code = runQueueCommand(repoRoot, { out: outDir, errSink: (s) => lines.push(s) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/gates/i);
  });

  it("route produces route.json + prints the decision, exits 0", () => {
    const { repoRoot, outDir } = repo();
    created.push(repoRoot);
    runQueueCommand(repoRoot, { out: outDir, errSink: () => {} });
    const lines: string[] = [];
    const code = runRouteCommand(repoRoot, { out: outDir, sink: (s) => lines.push(s), errSink: () => {} });
    expect(code).toBe(0);
    const file = join(outDir, "route.json");
    expect(existsSync(file)).toBe(true);
    expect(validateRouteDecision(JSON.parse(readFileSync(file, "utf8"))).ok).toBe(true);
    expect(lines.join("\n")).toMatch(/next:/);
  });

  it("route exits 1 with 'run queue first' when queue.json is missing", () => {
    const { repoRoot, outDir } = repo();
    created.push(repoRoot);
    const lines: string[] = [];
    const code = runRouteCommand(repoRoot, { out: outDir, errSink: (s) => lines.push(s) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/queue/i);
  });
});
