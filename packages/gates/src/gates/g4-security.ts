import type { Finding, GateContext, Gate } from "../types.js";
import type { Evidence } from "@aker-build/project-map";
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
const NEARBY_GUARD_LINES = 2;

function sameLocation(a: Evidence, b: Evidence): boolean {
  return a.path === b.path && (a.line ?? 1) === (b.line ?? 1);
}

function nearby(route: Evidence, guard: Evidence): boolean {
  return route.path === guard.path && Math.abs((route.line ?? 1) - (guard.line ?? 1)) <= NEARBY_GUARD_LINES;
}

function isAuthGuard(evidence: Evidence): boolean {
  return evidence.signal === "auth_guard" || evidence.signal === "auth_guard_decorator";
}

function isRoleGuard(evidence: Evidence): boolean {
  return evidence.signal === "role_guard" || evidence.signal === "role_guard_decorator";
}

function isDecoratorGuard(evidence: Evidence): boolean {
  return evidence.signal.endsWith("_guard_decorator");
}

function locationKey(path: string, line: number): string {
  return `${path}\0${line}`;
}

function findingsFromRouteEvidence(routes: Evidence[], auth: Evidence[], allowedPaths: Set<string>): Finding[] {
  const findings: Finding[] = [];
  const definitions = routes.filter((evidence) => evidence.signal === "route_definition" && evidence.path && allowedPaths.has(evidence.path));
  const adminRoutes = routes.filter((evidence) => evidence.signal === "route_admin" && evidence.path && allowedPaths.has(evidence.path));
  const nearbyAuthGuards = auth.filter((evidence) =>
    evidence.path && allowedPaths.has(evidence.path) && (isAuthGuard(evidence) || isRoleGuard(evidence)),
  );
  const fileAuthGuards = auth.filter((evidence) =>
    evidence.path && allowedPaths.has(evidence.path) && isAuthGuard(evidence),
  );
  const roleGuards = auth.filter((evidence) =>
    evidence.path && allowedPaths.has(evidence.path) && isRoleGuard(evidence),
  );

  for (const route of definitions) {
    if (nearbyAuthGuards.some((guard) => sameLocation(route, guard) || (isDecoratorGuard(guard) && nearby(route, guard)))) continue;
    const confidence = fileAuthGuards.some((guard) => guard.path === route.path) ? "medium" : "high";
    findings.push(
      risk(ID, "high", [
        lineEvidence(route.path!, route.line ?? 1, "API route without an auth guard", confidence),
      ]),
    );
  }

  for (const adminRoute of adminRoutes) {
    if (!definitions.some((route) => sameLocation(route, adminRoute))) continue;
    const fileRoleGuards = roleGuards.filter((guard) => guard.path === adminRoute.path);
    if (fileRoleGuards.some((guard) => sameLocation(adminRoute, guard) || (isDecoratorGuard(guard) && nearby(adminRoute, guard)))) continue;
    const confidence = fileRoleGuards.length > 0 ? "medium" : "high";
    findings.push(
      risk(ID, "high", [
        lineEvidence(adminRoute.path!, adminRoute.line ?? 1, "admin route without a role guard", confidence),
      ]),
    );
  }

  return findings;
}

/**
 * Security/Tenant Isolation Gate — flags routes without auth guards, admin routes without role
 * guards, and secrets printed in logs. Line-precise evidence; never copies the secret value.
 */
function run(ctx: GateContext): Finding[] {
  const findings: Finding[] = [];
  const allowedPaths = new Set(ctx.listFiles(ctx.repoRoot));
  const hasRouteEvidence = ctx.projectMap.routes !== undefined && ctx.projectMap.auth !== undefined;
  const mappedRouteLocations = new Set<string>();
  const mappedAdminLocations = new Set<string>();
  if (hasRouteEvidence) {
    findings.push(...findingsFromRouteEvidence(ctx.projectMap.routes ?? [], ctx.projectMap.auth ?? [], allowedPaths));
    for (const evidence of ctx.projectMap.routes ?? []) {
      if (!evidence.path || !allowedPaths.has(evidence.path)) continue;
      const key = locationKey(evidence.path, evidence.line ?? 1);
      if (evidence.signal === "route_definition") mappedRouteLocations.add(key);
      if (evidence.signal === "route_admin") mappedAdminLocations.add(key);
    }
  }

  for (const file of sourceFiles(ctx)) {
    const content = readCode(ctx, file);
    if (!content.trim()) continue;

    // Live source detection supplements route locations absent from the map. This preserves
    // legacy-map behavior and catches routes added after scan, while mapped locations stay on the
    // normalized evidence path so framework signature packs reach G4 without duplicate findings.
    // Route-precise + confidence-varied (P2). A guard token ON the route line → guarded, no
    // finding. Otherwise: if NO guard token appears anywhere in the file, the route is provably
    // unguarded → high confidence (→ confirmed). If a token exists elsewhere in the file, the
    // route may be protected by middleware (e.g. `router.use(requireAuth)`) we can't prove from
    // here → medium confidence (→ suspected; advisory, never blocks). This stops the common
    // middleware pattern from being a high-confidence false positive.
    const fileHasGuard = AUTH_GUARD.test(content);
    const lines = content.split(/\r?\n/);
    const liveRouteLines = matchingLines(content, ROUTE_DEF);
    for (const line of liveRouteLines) {
      if (mappedRouteLocations.has(locationKey(file, line))) continue;
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
    for (const line of liveRouteLines.filter((line) => ADMIN_ROUTE.test(lines[line - 1] ?? ""))) {
      if (mappedAdminLocations.has(locationKey(file, line))) continue;
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

  // Missing tenant filter (P1 data_access evidence, consumed at last). The scanner (W3a) is
  // receiver-gated to common DB handle names plus raw SQL and scans a 5-line statement window,
  // but a window cannot PROVE the filter is absent (a neighboring statement's tenant token can
  // fall inside it), so this emits medium confidence (→ suspected, advisory-only). Upgrading to
  // confirmed awaits a proven FP≈0 record on the benchmark corpus (plan decision 4). Never
  // confirmed from this signal alone.
  for (const ev of ctx.projectMap.data_access ?? []) {
    if (ev.signal !== "no_tenant_filter" || !ev.path) continue;
    findings.push(
      risk(ID, "high", [
        lineEvidence(ev.path, ev.line ?? 1, "DB query without a tenant filter (statement-window heuristic)", "medium"),
      ]),
    );
  }

  return findings;
}

export const g4Security: Gate = {
  id: ID,
  name: "Security/Tenant Isolation Gate",
  purpose: "Detect missing or risky tenant/auth boundaries.",
  run,
};
