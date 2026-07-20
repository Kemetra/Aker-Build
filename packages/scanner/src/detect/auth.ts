import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";
import { matchingSignaturePacks, SOURCE_FILE, stripComments } from "./signature-packs.js";

const AUTH_GUARD = /\b(requireAuth|authenticate|isAuthenticated|authGuard|ensureAuth|withAuth|verifyToken)\b/i;
const ROLE_GUARD = /\b(requireRole|isAdmin|adminOnly|hasRole|checkRole|authorize)\b/i;

/**
 * Detect auth boundary evidence. Read-only: records WHERE auth/role guards exist (auth_guard,
 * role_guard). Whether a given route LACKS one is G4's correlation to make, not this detector's.
 * Sorted by path then line. Honesty: none -> empty array.
 */
export function detectAuth(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_FILE.test(rel)) continue;
    const rawContent = readFileSafe(root, rel);
    if (rawContent === null) continue;
    const content = stripComments(rawContent);
    const authPacks = matchingSignaturePacks(rel, content).filter((pack) => pack.auth);
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      const matchingRolePacks = authPacks.filter((pack) => pack.auth?.role?.test(text));
      const matchingAuthPacks = authPacks.filter((pack) => pack.auth?.guard.test(text));
      const hasRoleGuard = ROLE_GUARD.test(text) || matchingRolePacks.length > 0;
      const hasAuthGuard = AUTH_GUARD.test(text) || matchingAuthPacks.length > 0;
      if (hasRoleGuard) {
        const signal = matchingRolePacks.some((pack) => pack.auth?.roleKind === "decorator")
          ? "role_guard_decorator"
          : "role_guard";
        out.push({ type: "line", path: rel, line: i + 1, signal, confidence: "high" });
      }
      if (hasAuthGuard) {
        const signal = matchingAuthPacks.some((pack) => pack.auth?.guardKind === "decorator")
          ? "auth_guard_decorator"
          : "auth_guard";
        out.push({ type: "line", path: rel, line: i + 1, signal, confidence: "high" });
      }
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
