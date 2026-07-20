import { describe, it, expect } from "vitest";
import { g4Security } from "../src/gates/g4-security.js";
import type { GateContext, Finding } from "../src/types.js";
import type { Evidence } from "@aker-build/project-map";

// Minimal in-memory GateContext: g4.run uses only repoRoot/listFiles/readFileSafe.
function ctxWith(file: string, content: string): GateContext {
  return {
    projectMap: { critical_surfaces: [] } as never,
    repoRoot: "/x",
    listFiles: () => [file],
    fileExists: () => true,
    readFileSafe: (_r: string, p: string) => (p === file ? content : null),
  } as unknown as GateContext;
}

function ctxWithEvidence(file: string, content: string, routes: Evidence[], auth: Evidence[]): GateContext {
  const ctx = ctxWith(file, content);
  ctx.projectMap = { critical_surfaces: [], routes, auth } as never;
  return ctx;
}

function line(path: string, lineNumber: number, signal: string): Evidence {
  return { type: "line", path, line: lineNumber, signal, confidence: "high" };
}

const routeFindings = (findings: Finding[]) =>
  findings.filter((x) => x.evidence.some((e) => e.signal.includes("auth guard")));

describe("G4 route precision", () => {
  it("flags only the unguarded route in a file that has a guarded one too", () => {
    const content = [`app.get("/safe", requireAuth, handler);`, `app.get("/open", handler);`].join("\n");
    const rf = routeFindings(g4Security.run(ctxWith("api.ts", content)));
    expect(rf).toHaveLength(1);
    expect(rf[0]?.evidence[0]?.line).toBe(2);
  });

  it("flags nothing when every route is guarded on its line", () => {
    const content = `app.get("/a", requireAuth, h);\napp.post("/b", authenticate, h);`;
    expect(routeFindings(g4Security.run(ctxWith("api.ts", content)))).toHaveLength(0);
  });

  it("emits HIGH confidence when no auth token appears anywhere in the file", () => {
    const rf = routeFindings(g4Security.run(ctxWith("api.ts", `app.get("/open", handler);`)));
    expect(rf).toHaveLength(1);
    expect(rf[0]?.evidence[0]?.confidence).toBe("high");
  });

  it("emits MEDIUM confidence when a guard token exists in the file but not on the route line (possible middleware)", () => {
    const content = `router.use(requireAuth);\nrouter.get("/users", handler);`;
    const rf = routeFindings(g4Security.run(ctxWith("api.ts", content)));
    expect(rf).toHaveLength(1);
    expect(rf[0]?.evidence[0]?.confidence).toBe("medium");
  });
});

const adminFindings = (findings: Finding[]) =>
  findings.filter((x) => x.evidence.some((e) => e.signal.includes("role guard")));

describe("G4 admin-route confidence honesty", () => {
  it("HIGH confidence for an admin route when no role guard appears anywhere in the file", () => {
    const af = adminFindings(g4Security.run(ctxWith("api.ts", `app.get("/admin/users", handler);`)));
    expect(af).toHaveLength(1);
    expect(af[0]?.evidence[0]?.confidence).toBe("high");
  });

  it("MEDIUM confidence when a role guard exists elsewhere in the file (possible role middleware)", () => {
    const content = `router.use(requireRole("admin"));\nrouter.get("/admin/users", handler);`;
    const af = adminFindings(g4Security.run(ctxWith("api.ts", content)));
    expect(af).toHaveLength(1);
    expect(af[0]?.evidence[0]?.confidence).toBe("medium");
  });
});

describe("G4 scanner-evidence correlation", () => {
  it("flags a NestJS admin route with no auth or role evidence", () => {
    const routes = [line("users.controller.ts", 2, "route_definition"), line("users.controller.ts", 2, "route_admin")];
    const findings = g4Security.run(ctxWithEvidence("users.controller.ts", `@Controller("users")\n@Get("admin")\nlist() {}`, routes, []));

    expect(routeFindings(findings)).toHaveLength(1);
    expect(adminFindings(findings)).toHaveLength(1);
    expect(findings.every((finding) => finding.evidence[0]?.confidence === "high")).toBe(true);
  });

  it("accepts nearby NestJS auth and role decorators", () => {
    const routes = [line("users.controller.ts", 4, "route_definition"), line("users.controller.ts", 4, "route_admin")];
    const auth = [line("users.controller.ts", 2, "auth_guard_decorator"), line("users.controller.ts", 3, "role_guard_decorator")];
    const content = `@Controller("users")\n@UseGuards(AuthGuard)\n@Roles("admin")\n@Get("admin")\nlist() {}`;
    const findings = g4Security.run(ctxWithEvidence("users.controller.ts", content, routes, auth));

    expect(routeFindings(findings)).toHaveLength(0);
    expect(adminFindings(findings)).toHaveLength(0);
  });

  it("downgrades a distant file-level guard to medium confidence", () => {
    const routes = [line("users.controller.ts", 10, "route_definition")];
    const auth = [line("users.controller.ts", 1, "auth_guard")];
    const findings = routeFindings(g4Security.run(ctxWithEvidence("users.controller.ts", "", routes, auth)));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]?.confidence).toBe("medium");
  });

  it("keeps nearby file-level middleware ambiguous rather than treating it as a decorator", () => {
    const routes = [line("routes.ts", 7, "route_definition")];
    const auth = [line("routes.ts", 5, "auth_guard")];
    const findings = routeFindings(g4Security.run(ctxWithEvidence("routes.ts", "", routes, auth)));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]?.confidence).toBe("medium");
  });

  it("live-detects a route added after a v2 Project Map was produced", () => {
    const findings = routeFindings(g4Security.run(ctxWithEvidence(
      "api.ts",
      `app.get("/new", handler);`,
      [],
      [],
    )));

    expect(findings).toHaveLength(1);
    expect(findings[0]?.evidence[0]?.confidence).toBe("high");
  });

  it("does not duplicate a live route already represented in Project Map evidence", () => {
    const routes = [line("api.ts", 1, "route_definition")];
    const findings = routeFindings(g4Security.run(ctxWithEvidence(
      "api.ts",
      `app.get("/open", handler);`,
      routes,
      [],
    )));

    expect(findings).toHaveLength(1);
  });
});
