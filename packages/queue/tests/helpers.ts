import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import type { RiskList, Finding } from "@tenantguard/gates";
import type { ProjectMap } from "@tenantguard/project-map";

/** A minimal valid 002 ProjectMap for tests (empty/honest). */
export function minimalMap(): ProjectMap {
  return {
    version: 1,
    project: { name: "fixture", detected_stack: { runtime: null, package_manager: null, frameworks: [] } },
    repos: [],
    boundaries: [],
    tenant_model: { status: "not_detected", strategy: null, tenant_key: null, required_surfaces: [] },
    critical_surfaces: [],
  } as ProjectMap;
}

/** A risk finding helper. */
export function riskFinding(gateId: string, severity: Finding["severity"], path: string, signal: string): Finding {
  return {
    gate_id: gateId,
    status: "risk",
    severity: severity as Exclude<Finding["severity"], null>,
    evidence: [{ type: "line", path, line: 1, signal, confidence: "high" }],
  } as Finding;
}

/** A needs_verification finding helper. */
export function needsVerificationFinding(gateId: string, signal: string): Finding {
  return {
    gate_id: gateId,
    status: "needs_verification",
    severity: null,
    evidence: [{ type: "missing_artifact", path: null, line: null, signal, confidence: "low" }],
  };
}

export function riskList(findings: Finding[]): RiskList {
  return { schema_version: 1, findings };
}

/**
 * Write a synthetic map + risks pair into a fresh temp git repo and return { repoRoot, outDir }.
 * Lets context.buildContext() load real artifacts for end-to-end derive/route tests.
 */
export function fixtureRepo(map: ProjectMap, risks: RiskList): { repoRoot: string; outDir: string } {
  const repoRoot = join(mkdtempSync(join(tmpdir(), "tg-queue-")), "repo");
  mkdirSync(repoRoot, { recursive: true });
  const git = (...a: string[]) => execFileSync("git", a, { cwd: repoRoot, stdio: "ignore" });
  git("init", "-q");
  git("config", "user.email", "test@tenantguard.local");
  git("config", "user.name", "TenantGuard Test");

  const outDir = join(repoRoot, ".tenantguard");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "project-map.json"), JSON.stringify(map, null, 2), "utf8");
  writeFileSync(join(outDir, "risks.json"), JSON.stringify(risks, null, 2), "utf8");
  return { repoRoot, outDir };
}
