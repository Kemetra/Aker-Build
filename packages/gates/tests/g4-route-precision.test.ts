import { describe, it, expect } from "vitest";
import { g4Security } from "../src/gates/g4-security.js";
import type { GateContext, Finding } from "../src/types.js";

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
