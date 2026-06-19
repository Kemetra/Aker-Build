import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync, existsSync, readFileSync, mkdtempSync, cpSync, mkdirSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { scanToFile } from "@tenantguard/scanner";
import { validateRisks } from "@tenantguard/gates";
import { runGatesCommand } from "../src/commands/gates.js";

const here = dirname(fileURLToPath(import.meta.url));
const vulnSrc = resolve(here, "../../gates/tests/fixtures/vuln");

/** Prepare a vuln repo (git init + produced project-map.json) in a temp dir. */
function prepRepoWithMap(): { repoRoot: string; outDir: string } {
  const repoRoot = join(mkdtempSync(join(tmpdir(), "tg-cli-gates-")), "vuln");
  cpSync(vulnSrc, repoRoot, { recursive: true });
  const git = (...a: string[]) => execFileSync("git", a, { cwd: repoRoot, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@tenantguard.local");
  git("config", "user.name", "TenantGuard Test");
  const outDir = join(repoRoot, ".tenantguard");
  scanToFile(repoRoot, outDir);
  return { repoRoot, outDir };
}

/** Prepare a repo with NO produced map (git init only). */
function prepRepoNoMap(): { repoRoot: string; outDir: string } {
  const repoRoot = join(mkdtempSync(join(tmpdir(), "tg-cli-gates-nomap-")), "vuln");
  cpSync(vulnSrc, repoRoot, { recursive: true });
  const git = (...a: string[]) => execFileSync("git", a, { cwd: repoRoot, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@tenantguard.local");
  git("config", "user.name", "TenantGuard Test");
  const outDir = join(repoRoot, ".tenantguard");
  mkdirSync(outDir, { recursive: true });
  return { repoRoot, outDir };
}

const created: string[] = [];
afterEach(() => {
  for (const p of created) if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  created.length = 0;
});

describe("T033 `tenantguard gates` command", () => {
  it("produces a valid risks.json and exits 0", () => {
    const { repoRoot, outDir } = prepRepoWithMap();
    created.push(repoRoot);
    const code = runGatesCommand(repoRoot, { out: outDir, errSink: () => {} });
    expect(code).toBe(0);
    const file = resolve(outDir, "risks.json");
    expect(existsSync(file)).toBe(true);
    expect(validateRisks(JSON.parse(readFileSync(file, "utf8"))).ok).toBe(true);
  });

  it("exits 1 with a 'run scan first' signal when no project-map.json exists", () => {
    const { repoRoot, outDir } = prepRepoNoMap();
    created.push(repoRoot);
    const lines: string[] = [];
    const code = runGatesCommand(repoRoot, { out: outDir, errSink: (s) => lines.push(s) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/scan/i);
  });

  it("exits 2 on an unknown --gates id", () => {
    const { repoRoot, outDir } = prepRepoWithMap();
    created.push(repoRoot);
    const code = runGatesCommand(repoRoot, { out: outDir, gates: "TG-G99", errSink: () => {} });
    expect(code).toBe(2);
  });

  it("runs only the named subset via --gates", () => {
    const { repoRoot, outDir } = prepRepoWithMap();
    created.push(repoRoot);
    const lines: string[] = [];
    const code = runGatesCommand(repoRoot, { out: outDir, gates: "TG-G4", stdout: true, sink: (s) => lines.push(s) });
    expect(code).toBe(0);
    const risks = JSON.parse(lines.join("\n"));
    const ids = new Set(risks.findings.map((f: { gate_id: string }) => f.gate_id));
    expect([...ids]).toEqual(["TG-G4"]);
  });

  it("applies visible suppressions from --config", () => {
    const { repoRoot, outDir } = prepRepoWithMap();
    created.push(repoRoot);
    const configPath = join(repoRoot, "tenantguard.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        gates: {
          "TG-G4": {
            suppressions: [
              {
                id: "TG-G4-CLI-001",
                path: "apps/api/routes/admin.ts",
                reason: "CLI fixture suppression.",
                owner: "maintainer",
              },
            ],
          },
        },
      }),
      "utf8",
    );

    const code = runGatesCommand(repoRoot, { out: outDir, config: configPath, errSink: () => {} });
    expect(code).toBe(0);
    const risks = JSON.parse(readFileSync(resolve(outDir, "risks.json"), "utf8"));
    expect(risks.findings.some((f: { suppression?: { id: string } }) => f.suppression?.id === "TG-G4-CLI-001")).toBe(true);
  });
});
