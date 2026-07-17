import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;
const ROUTE_DEF = /\b(app|router|server)\.(get|post|put|patch|delete)\s*\(/i;
const ADMIN_PATH = /['"`]\/?admin(\/|['"`])/i;

/**
 * Detect API route definitions as Evidence. Read-only: one route_definition per matched line, plus
 * a route_admin signal when the line targets an /admin path. Never judges (a missing auth guard is
 * G4's call, not this detector's). Sorted by path then line. Honesty: no routes -> empty array.
 */
export function detectRoutes(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      if (!ROUTE_DEF.test(text)) continue;
      out.push({ type: "line", path: rel, line: i + 1, signal: "route_definition", confidence: "high" });
      if (ADMIN_PATH.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "route_admin", confidence: "high" });
      }
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
