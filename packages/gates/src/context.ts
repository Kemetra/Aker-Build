import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadJson, validate, type ProjectMap } from "@tenantguard/project-map";
import { listFiles, fileExists, readFileSafe, isGitRepo } from "@tenantguard/scanner";
import type { GateContext } from "./types.js";

/** Raised when the project map is missing — the CLI maps this to "run scan first" (exit 1). */
export class MissingProjectMapError extends Error {}
/** Raised when the target is not a Git repo — the CLI maps this to bad input (exit 2). */
export class NotGitRepoError extends Error {}
/** Raised when the loaded project map fails 002 validation. */
export class InvalidProjectMapError extends Error {}

/**
 * Build a read-only GateContext for `repoRoot`, loading the previously produced project map
 * from `<outDir>/project-map.json` (002 `loadJson` + `validate`) and wiring the scanner's
 * read-only fs primitives (FR-008, R2). Reads only; never writes or mutates the scanned repo.
 */
export function buildContext(repoRoot: string, outDir: string): GateContext {
  if (!isGitRepo(repoRoot)) {
    throw new NotGitRepoError(
      `Not a Git repository: ${repoRoot} (scanning non-Git directories is out of MVP scope)`,
    );
  }

  const mapPath = resolve(outDir, "project-map.json");
  if (!existsSync(mapPath)) {
    throw new MissingProjectMapError(
      `No produced map at ${mapPath}. Run \`tenantguard scan\` first.`,
    );
  }

  const parsed = loadJson(readFileSync(mapPath, "utf8"));
  const result = validate(parsed);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ");
    throw new InvalidProjectMapError(`project-map.json failed 002 validation: ${detail}`);
  }

  return {
    projectMap: parsed as ProjectMap,
    repoRoot,
    listFiles,
    fileExists,
    readFileSafe,
  };
}
