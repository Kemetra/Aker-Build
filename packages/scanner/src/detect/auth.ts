import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;
const AUTH_GUARD = /\b(requireAuth|authenticate|isAuthenticated|authGuard|ensureAuth|withAuth|verifyToken)\b/;
const ROLE_GUARD = /\b(requireRole|isAdmin|adminOnly|hasRole|checkRole|authorize)\b/;

/**
 * Detect auth boundary evidence. Read-only: records WHERE auth/role guards exist (auth_guard,
 * role_guard). Whether a given route LACKS one is G4's correlation to make, not this detector's.
 * Sorted by path then line. Honesty: none -> empty array.
 */
export function detectAuth(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      if (ROLE_GUARD.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "role_guard", confidence: "high" });
      } else if (AUTH_GUARD.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "auth_guard", confidence: "high" });
      }
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
