import type { Finding, GateContext, Gate } from "../types.js";
import { risk, lineEvidence, sourceFiles, readCode, matchingLines } from "./helpers.js";

const ID = "TG-G4";

// A route definition (Express/Fastify-style).
const ROUTE_DEF = /\b(app|router|server)\.(get|post|put|patch|delete)\s*\(/i;
// An auth/role guard present on or near a route.
const AUTH_GUARD = /\b(requireAuth|authenticate|isAuthenticated|authGuard|ensureAuth|withAuth|requireRole|authorize|verifyToken|jwt)\b/i;
// An admin route path.
const ADMIN_ROUTE = /['"`]\/?admin(\/|['"`])/i;
const ROLE_GUARD = /\b(requireRole|isAdmin|adminOnly|hasRole|checkRole)\b/i;
// A secret printed in logs.
const SECRET_IN_LOG = /\b(console\.(log|error|warn|info)|logger\.\w+)\s*\([^)]*\b(password|secret|token|api[_-]?key|apikey|credential)\b/i;

/**
 * Security/Tenant Isolation Gate — flags routes without auth guards, admin routes without role
 * guards, and secrets printed in logs. Line-precise evidence; never copies the secret value.
 */
function run(ctx: GateContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of sourceFiles(ctx)) {
    const content = readCode(ctx, file);
    if (!content.trim()) continue;

    // Route-precise + confidence-varied (P2). A guard token ON the route line → guarded, no
    // finding. Otherwise: if NO guard token appears anywhere in the file, the route is provably
    // unguarded → high confidence (→ confirmed). If a token exists elsewhere in the file, the
    // route may be protected by middleware (e.g. `router.use(requireAuth)`) we can't prove from
    // here → medium confidence (→ suspected; advisory, never blocks). This stops the common
    // middleware pattern from being a high-confidence false positive.
    const fileHasGuard = AUTH_GUARD.test(content);
    const lines = content.split(/\r?\n/);
    for (const line of matchingLines(content, ROUTE_DEF)) {
      const text = lines[line - 1] ?? "";
      if (AUTH_GUARD.test(text)) continue; // guarded on its own line
      const confidence = fileHasGuard ? "medium" : "high";
      findings.push(
        risk(ID, "high", [
          lineEvidence(file, line, "API route without an auth guard", confidence),
        ]),
      );
    }

    // Admin route without a role guard — same route-precise + confidence-varied honesty as the
    // auth-guard check above. A role guard on the admin line → fine. Otherwise high confidence
    // only if no role guard appears anywhere in the file; medium if one exists elsewhere (the
    // admin route may be protected by file-level role middleware we can't prove from here).
    const fileHasRoleGuard = ROLE_GUARD.test(content);
    for (const line of matchingLines(content, ADMIN_ROUTE)) {
      const text = lines[line - 1] ?? "";
      if (ROLE_GUARD.test(text)) continue;
      const confidence = fileHasRoleGuard ? "medium" : "high";
      findings.push(
        risk(ID, "high", [
          lineEvidence(file, line, "admin route without a role guard", confidence),
        ]),
      );
    }

    for (const line of matchingLines(content, SECRET_IN_LOG)) {
      // Evidence names the pattern only — the secret value is never placed in the output (FR-009).
      findings.push(
        risk(ID, "critical", [
          lineEvidence(file, line, "secret-like value printed in logs", "high"),
        ]),
      );
    }
  }
  return findings;
}

export const g4Security: Gate = {
  id: ID,
  name: "Security/Tenant Isolation Gate",
  purpose: "Detect missing or risky tenant/auth boundaries.",
  run,
};
