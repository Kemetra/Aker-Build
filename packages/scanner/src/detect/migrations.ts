import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

// A migration file: lives under a migrations dir.
const MIGRATION_PATH = /(^|\/)migrations?\//i;
const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|ALTER\s+TABLE\s+\w+\s+DROP)\b/i;

/**
 * Detect migration safety evidence. Read-only: within migration files only, flag destructive ops
 * (destructive_migration) line-by-line; if a migration file has none, emit one migration_present at
 * line 1. Reversibility judgment is G3's call, not this detector's. Sorted by path then line.
 */
export function detectMigrations(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!MIGRATION_PATH.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    let destructiveFound = false;
    for (let i = 0; i < lines.length; i++) {
      if (DESTRUCTIVE.test(lines[i] ?? "")) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "destructive_migration", confidence: "high" });
        destructiveFound = true;
      }
    }
    if (!destructiveFound) {
      out.push({ type: "line", path: rel, line: 1, signal: "migration_present", confidence: "high" });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
