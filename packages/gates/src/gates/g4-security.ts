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

    const hasAuthGuard = AUTH_GUARD.test(content);
    for (const line of matchingLines(content, ROUTE_DEF)) {
      if (!hasAuthGuard) {
        findings.push(
          risk(ID, "high", [
            lineEvidence(file, line, "API route without an auth guard", "high"),
          ]),
        );
      }
    }

    const hasRoleGuard = ROLE_GUARD.test(content);
    if (ADMIN_ROUTE.test(content) && !hasRoleGuard) {
      const line = matchingLines(content, ADMIN_ROUTE)[0] ?? 1;
      findings.push(
        risk(ID, "high", [
          lineEvidence(file, line, "admin route without a role guard", "high"),
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
