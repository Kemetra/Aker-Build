import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

// Only inspect source files that plausibly contain query code.
const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;

// A db-ish receiver chain followed by a query/builder method. Receiver gating (W3a): bare
// `items.find(` / `map.delete(` are array/Map calls, not queries — the chain must START with a
// word that names a database handle. Raw SQL counts regardless of receiver.
const ORM_QUERY =
  /\b(db|prisma|knex|sequelize|orm|repo|repository|client|conn|connection|pool|tx|trx|store|datastore|typeorm|drizzle)\b[\w.]*\.\s*(find|findMany|findFirst|findUnique|findOne|select|update|delete|insert|create)\s*\(/i;
const RAW_SQL =
  /\b(SELECT|UPDATE|DELETE|INSERT)\b[\s\S]{0,80}\bFROM\b|\bUPDATE\b\s+\w+\s+\bSET\b/i;

// A tenant-id token scoping the statement.
const TENANT_TOKEN = /\btenant_?id\b|\borg_?id\b|\baccount_?id\b/i;

// Statement window: multi-line builder calls put the `where:` clause below the call, so the
// window must extend past the match line — but only to the end of the query's OWN statement. An
// unconditional line window lets a neighbouring statement's tenant token scope an unscoped query,
// which is a false negative in the tenant-isolation gate. Bounding by bracket depth keeps the
// multi-line case working while cutting the window off where the statement ends.
//
// Still a heuristic, not a parser: a regex window can neither prove presence robustly nor prove
// absence, so every window-based classification is emitted at medium confidence; only a same-line
// tenant token is high.
const MAX_WINDOW_LINES = 20;

/**
 * The lines belonging to the statement that starts on `startIndex`, bounded by bracket depth.
 * Walks forward while the call's brackets remain open, so the window ends where the statement
 * does. Capped at MAX_WINDOW_LINES so an unbalanced or minified file cannot run away.
 */
function statementWindow(lines: string[], startIndex: number): string {
  const first = lines[startIndex] ?? "";
  let depth = countDepth(first);
  if (depth <= 0) return ""; // statement closed on its own line — nothing below belongs to it
  const collected: string[] = [];
  const limit = Math.min(lines.length, startIndex + 1 + MAX_WINDOW_LINES);
  for (let i = startIndex + 1; i < limit; i++) {
    const line = lines[i] ?? "";
    collected.push(line);
    depth += countDepth(line);
    if (depth <= 0) break; // the statement's brackets closed here
  }
  return collected.join("\n");
}

/** Net bracket depth contributed by a line: openers minus closers. */
function countDepth(line: string): number {
  let depth = 0;
  for (const ch of line) {
    if (ch === "(" || ch === "{" || ch === "[") depth++;
    else if (ch === ")" || ch === "}" || ch === "]") depth--;
  }
  return depth;
}

/**
 * Detect database access sites as normative Evidence. Read-only: records WHERE a query happens
 * and encodes tenant-scoping in the signal ("tenant_scoped" vs "no_tenant_filter"). Never judges
 * and never stores a value. Returned sorted by path then line (determinism). Honesty: no sites
 * -> empty array.
 */
export function detectDataAccess(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      if (!ORM_QUERY.test(text) && !RAW_SQL.test(text)) continue;
      if (TENANT_TOKEN.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "tenant_scoped", confidence: "high" });
        continue;
      }
      const window = statementWindow(lines, i);
      out.push({
        type: "line",
        path: rel,
        line: i + 1,
        signal: TENANT_TOKEN.test(window) ? "tenant_scoped" : "no_tenant_filter",
        confidence: "medium",
      });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
