import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadJson, validate, type ProjectMap } from "@tenantguard/project-map";
import { validateRisks, type RiskList } from "@tenantguard/gates";
import { isGitRepo } from "@tenantguard/scanner";
import type { QueueContext, RouterInputs } from "./types.js";

/** Raised when project-map.json is missing — CLI maps to "run scan first" (exit 1). */
export class MissingProjectMapError extends Error {}
/** Raised when risks.json is missing — CLI maps to "run gates first" (exit 1). */
export class MissingRisksError extends Error {}
/** Raised when the target is not a Git repo — CLI maps to bad input (exit 2). */
export class NotGitRepoError extends Error {}
/** Raised when a loaded artifact fails its schema. */
export class InvalidInputError extends Error {}

/**
 * Build a read-only QueueContext: load+validate project-map.json (002) and risks.json (004) from the
 * out-dir. Optional diff/PR inputs are read-only and default to empty when unavailable (FR-011, R2) —
 * v0 does not shell out for a diff; an absent diff simply skips the diff-dependent scoring factors.
 */
export function buildContext(repoRoot: string, outDir: string, inputs?: Partial<RouterInputs>): QueueContext {
  if (!isGitRepo(repoRoot)) {
    throw new NotGitRepoError(
      `Not a Git repository: ${repoRoot} (scanning non-Git directories is out of MVP scope)`,
    );
  }

  const mapPath = resolve(outDir, "project-map.json");
  if (!existsSync(mapPath)) {
    throw new MissingProjectMapError(`No produced map at ${mapPath}. Run \`tenantguard scan\` first.`);
  }
  const parsedMap = loadJson(readFileSync(mapPath, "utf8"));
  const mapResult = validate(parsedMap);
  if (!mapResult.ok) {
    throw new InvalidInputError(
      `project-map.json failed 002 validation: ${mapResult.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ")}`,
    );
  }

  const risksPath = resolve(outDir, "risks.json");
  if (!existsSync(risksPath)) {
    throw new MissingRisksError(`No produced risks at ${risksPath}. Run \`tenantguard gates\` first.`);
  }
  const parsedRisks = loadJson(readFileSync(risksPath, "utf8"));
  const risksResult = validateRisks(parsedRisks);
  if (!risksResult.ok) {
    throw new InvalidInputError(
      `risks.json failed schema validation: ${risksResult.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ")}`,
    );
  }

  return {
    projectMap: parsedMap as ProjectMap,
    risks: parsedRisks as RiskList,
    repoRoot,
    inputs: { changedFiles: inputs?.changedFiles ?? [] },
  };
}
