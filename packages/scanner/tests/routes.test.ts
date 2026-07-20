import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectRoutes } from "../src/detect/routes.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-p1-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("detectRoutes", () => {
  it("emits route_definition evidence for an Express-style route", () => {
    const root = fixture({ "api.ts": `app.get("/users", handler);\n` });
    const ev = detectRoutes(root, ["api.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "line", path: "api.ts", line: 1, signal: "route_definition", confidence: "high" });
  });

  it("emits an additional route_admin signal for an admin path", () => {
    const root = fixture({ "api.ts": `router.post("/admin/users", handler);\n` });
    const ev = detectRoutes(root, ["api.ts"]);
    expect(ev.map((e) => e.signal).sort()).toEqual(["route_admin", "route_definition"]);
  });

  it("returns empty for files with no routes (honesty)", () => {
    const root = fixture({ "util.ts": `export const x = 1;\n` });
    expect(detectRoutes(root, ["util.ts"])).toEqual([]);
  });

  it("ignores route signatures that appear only in comments", () => {
    const root = fixture({ "comments.ts": `// app.get("/admin", handler);\n` });
    expect(detectRoutes(root, ["comments.ts"])).toEqual([]);
  });

  it("is deterministic: sorted by path then line", () => {
    const root = fixture({ "b.ts": `app.get("/a", h);\n`, "a.ts": `app.get("/b", h);\n` });
    const ev = detectRoutes(root, ["b.ts", "a.ts"]);
    expect(ev.map((e) => e.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("recognizes Next.js App Router handlers only in route files", () => {
    const root = fixture({
      "app/admin/route.ts": `export async function GET() { return Response.json([]); }\n`,
      "lib/http.ts": `export async function GET() { return Response.json([]); }\n`,
    });

    expect(detectRoutes(root, ["lib/http.ts", "app/admin/route.ts"])).toEqual([
      { type: "line", path: "app/admin/route.ts", line: 1, signal: "route_definition", confidence: "high" },
      { type: "line", path: "app/admin/route.ts", line: 1, signal: "route_admin", confidence: "high" },
    ]);
  });

  it("recognizes NestJS, Fastify, and Django route signatures", () => {
    const root = fixture({
      "users.controller.ts": `@Controller("users")\n@Get("admin")\nlist() {}\n`,
      "fastify.ts": `import Fastify from "fastify";\nfastify.post("/events", handler);\n`,
      "urls.py": `from django.urls import path\npath("users/", views.users)\n`,
    });

    expect(detectRoutes(root, ["users.controller.ts", "fastify.ts", "urls.py"]).map((e) => `${e.path}:${e.line}:${e.signal}`)).toEqual([
      "fastify.ts:2:route_definition",
      "urls.py:2:route_definition",
      "users.controller.ts:2:route_definition",
      "users.controller.ts:2:route_admin",
    ]);
  });
});
