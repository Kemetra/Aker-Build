import { validate } from "@tenantguard/project-map";
import { filterPaths, loadConfig } from "@tenantguard/config";
import type { ScanResult, ScanOptions } from "./types.js";
import { listFiles, isGitRepo, writeOutput } from "./io.js";
import { assemble } from "./assemble.js";
import { detectSecrets } from "./detect/secrets.js";

/**
 * Read-only scan of a local Git repo → a 002-conforming ProjectMap + run notes.
 * - Strictly read-only on the scanned repo (FR-003).
 * - Validates the assembled map against @tenantguard/project-map before returning (R5).
 * - No network, no credentials (FR-011).
 */
export function scan(targetPath: string, opts: ScanOptions = {}): ScanResult {
  if (!isGitRepo(targetPath)) {
    throw new Error(
      `Not a Git repository: ${targetPath} (scanning non-Git directories is out of MVP scope)`,
    );
  }

  const config = loadConfig(targetPath, { configPath: opts.configPath }).config;
  const scopedListFiles = (root: string): string[] => filterPaths(listFiles(root), config);
  const { map, notes } = assemble(targetPath, scopedListFiles);

  // Secret safety: flag-only, value never captured (FR-012).
  const files = scopedListFiles(targetPath);
  notes.push(...detectSecrets(targetPath, files));

  // The producer must never emit an invalid map (R5, FR-002).
  const result = validate(map);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path}: ${e.message}`).join("; ");
    throw new Error(`Internal error: assembled map failed 002 validation: ${detail}`);
  }

  return { map, notes };
}

/** Scan and write the map (+ implied notes) to a designated output dir outside the scanned repo. */
export function scanToFile(
  targetPath: string,
  outDir: string,
  opts: ScanOptions = {},
): { result: ScanResult; outPath: string } {
  const result = scan(targetPath, opts);
  const outPath = writeOutput(outDir, "project-map.json", JSON.stringify(result.map, null, 2));
  return { result, outPath };
}
