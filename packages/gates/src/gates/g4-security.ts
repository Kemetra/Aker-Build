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

interface MappedRouteState {
  findings: Finding[];
  routeLocations: Set<string>;
  adminLocations: Set<string>;
}

function isAllowedEvidence(evidence: Evidence, allowedPaths: ReadonlySet<string>): boolean {
  if (!evidence.path) return false;
  return allowedPaths.has(evidence.path);
}

function isRelevantGuard(evidence: Evidence): boolean {
  return isAuthGuard(evidence) || isRoleGuard(evidence);
}

function guardProtectsRoute(route: Evidence, guard: Evidence): boolean {
  if (sameLocation(route, guard)) return true;
  if (!isDecoratorGuard(guard)) return false;
  return nearby(route, guard);
}

function missingAuthFinding(
  route: Evidence,
  relevantGuards: readonly Evidence[],
  authGuards: readonly Evidence[],
): Finding | null {
  if (relevantGuards.some((guard) => guardProtectsRoute(route, guard))) return null;
  const confidence = authGuards.some((guard) => guard.path === route.path) ? "medium" : "high";
  return risk(ID, "high", [
    lineEvidence(route.path!, route.line ?? 1, "API route without an auth guard", confidence),
  ]);
}

function missingRoleFinding(
  adminRoute: Evidence,
  definitions: readonly Evidence[],
  roleGuards: readonly Evidence[],
): Finding | null {
  if (!definitions.some((route) => sameLocation(route, adminRoute))) return null;
  const fileRoleGuards = roleGuards.filter((guard) => guard.path === adminRoute.path);
  if (fileRoleGuards.some((guard) => guardProtectsRoute(adminRoute, guard))) return null;
  const confidence = fileRoleGuards.length > 0 ? "medium" : "high";
  return risk(ID, "high", [
    lineEvidence(adminRoute.path!, adminRoute.line ?? 1, "admin route without a role guard", confidence),
  ]);
}

function collectRouteFindings(
  definitions: readonly Evidence[],
  relevantGuards: readonly Evidence[],
  authGuards: readonly Evidence[],
): Finding[] {
  const findings: Finding[] = [];
  for (const route of definitions) {
    const finding = missingAuthFinding(route, relevantGuards, authGuards);
    if (finding) findings.push(finding);
  }
  return findings;
}

function collectAdminFindings(
  adminRoutes: readonly Evidence[],
  definitions: readonly Evidence[],
  roleGuards: readonly Evidence[],
): Finding[] {
  const findings: Finding[] = [];
  for (const adminRoute of adminRoutes) {
    const finding = missingRoleFinding(adminRoute, definitions, roleGuards);
    if (finding) findings.push(finding);
  }
  return findings;
}

function findingsFromRouteEvidence(routes: Evidence[], auth: Evidence[], allowedPaths: Set<string>): Finding[] {
  const allowedRoutes = routes.filter((evidence) => isAllowedEvidence(evidence, allowedPaths));
  const allowedAuth = auth.filter((evidence) => isAllowedEvidence(evidence, allowedPaths));
  const definitions = allowedRoutes.filter((evidence) => evidence.signal === "route_definition");
  const adminRoutes = allowedRoutes.filter((evidence) => evidence.signal === "route_admin");
  const authGuards = allowedAuth.filter(isAuthGuard);
  const roleGuards = allowedAuth.filter(isRoleGuard);
  const relevantGuards = allowedAuth.filter(isRelevantGuard);
  return [
    ...collectRouteFindings(definitions, relevantGuards, authGuards),
    ...collectAdminFindings(adminRoutes, definitions, roleGuards),
  ];
}

function locationsForSignal(
  routes: readonly Evidence[],
  signal: string,
  allowedPaths: ReadonlySet<string>,
): Set<string> {
  const locations = new Set<string>();
  for (const evidence of routes) {
    if (evidence.signal !== signal) continue;
    if (!evidence.path) continue;
    if (!allowedPaths.has(evidence.path)) continue;
    locations.add(locationKey(evidence.path, evidence.line ?? 1));
  }
  return locations;
}

function mappedRouteState(ctx: GateContext, allowedPaths: Set<string>): MappedRouteState {
  const routes = ctx.projectMap.routes;
  const auth = ctx.projectMap.auth;
  if (routes === undefined) return { findings: [], routeLocations: new Set(), adminLocations: new Set() };
  if (auth === undefined) return { findings: [], routeLocations: new Set(), adminLocations: new Set() };
  return {
    findings: findingsFromRouteEvidence(routes, auth, allowedPaths),
    routeLocations: locationsForSignal(routes, "route_definition", allowedPaths),
    adminLocations: locationsForSignal(routes, "route_admin", allowedPaths),
  };
}

function liveAuthFindings(
  file: string,
  content: string,
  lines: readonly string[],
  liveRouteLines: readonly number[],
  mappedLocations: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];
  const fileHasGuard = AUTH_GUARD.test(content);
  for (const line of liveRouteLines) {
    if (mappedLocations.has(locationKey(file, line))) continue;
    const text = lines[line - 1] ?? "";
    if (AUTH_GUARD.test(text)) continue;
    const confidence = fileHasGuard ? "medium" : "high";
    findings.push(risk(ID, "high", [lineEvidence(file, line, "API route without an auth guard", confidence)]));
  }
  return findings;
}

function liveAdminFindings(
  file: string,
  content: string,
  lines: readonly string[],
  liveRouteLines: readonly number[],
  mappedLocations: ReadonlySet<string>,
): Finding[] {
  const findings: Finding[] = [];
  const fileHasRoleGuard = ROLE_GUARD.test(content);
  const adminLines = liveRouteLines.filter((line) => ADMIN_ROUTE.test(lines[line - 1] ?? ""));
  for (const line of adminLines) {
    if (mappedLocations.has(locationKey(file, line))) continue;
    const text = lines[line - 1] ?? "";
    if (ROLE_GUARD.test(text)) continue;
    const confidence = fileHasRoleGuard ? "medium" : "high";
    findings.push(risk(ID, "high", [lineEvidence(file, line, "admin route without a role guard", confidence)]));
  }
  return findings;
}

function secretLogFindings(file: string, content: string): Finding[] {
  return matchingLines(content, SECRET_IN_LOG).map((line) =>
    risk(ID, "critical", [lineEvidence(file, line, "secret-like value printed in logs", "high")]),
  );
}

function sourceFileFindings(ctx: GateContext, file: string, mapped: MappedRouteState): Finding[] {
  const content = readCode(ctx, file);
  if (!content.trim()) return [];
  const lines = content.split(/\r?\n/);
  const liveRouteLines = matchingLines(content, ROUTE_DEF);
  return [
    ...liveAuthFindings(file, content, lines, liveRouteLines, mapped.routeLocations),
    ...liveAdminFindings(file, content, lines, liveRouteLines, mapped.adminLocations),
    ...secretLogFindings(file, content),
  ];
}

function sourceFindings(ctx: GateContext, mapped: MappedRouteState): Finding[] {
  const findings: Finding[] = [];
  for (const file of sourceFiles(ctx)) findings.push(...sourceFileFindings(ctx, file, mapped));
  return findings;
}

function isMissingTenantFilter(evidence: Evidence): boolean {
  if (evidence.signal !== "no_tenant_filter") return false;
  return Boolean(evidence.path);
}

function tenantFindings(dataAccess: readonly Evidence[]): Finding[] {
  return dataAccess.filter(isMissingTenantFilter).map((evidence) =>
    risk(ID, "high", [
      lineEvidence(
        evidence.path!,
        evidence.line ?? 1,
        "DB query without a tenant filter (statement-window heuristic)",
        "medium",
      ),
    ]),
  );
}

/**
 * Security/Tenant Isolation Gate — flags routes without auth guards, admin routes without role
 * guards, and secrets printed in logs. Line-precise evidence; never copies the secret value.
 */
function run(ctx: GateContext): Finding[] {
  const allowedPaths = new Set(ctx.listFiles(ctx.repoRoot));
  const mapped = mappedRouteState(ctx, allowedPaths);
  return [
    ...mapped.findings,
    ...sourceFindings(ctx, mapped),
    ...tenantFindings(ctx.projectMap.data_access ?? []),
  ];
}

export const g4Security: Gate = {
  id: ID,
  name: "Security/Tenant Isolation Gate",
  purpose: "Detect missing or risky tenant/auth boundaries.",
  run,
};
