import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectAuth } from "../src/detect/auth.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-p1-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("detectAuth", () => {
  it("emits auth_guard evidence for an authenticate middleware", () => {
    const root = fixture({ "mw.ts": `app.use(requireAuth());\n` });
    const ev = detectAuth(root, ["mw.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ signal: "auth_guard", confidence: "high", line: 1 });
  });

  it("emits role_guard evidence for an RBAC check", () => {
    const root = fixture({ "mw.ts": `if (requireRole("admin")) {}\n` });
    const ev = detectAuth(root, ["mw.ts"]);
    expect(ev.map((e) => e.signal)).toEqual(["role_guard"]);
  });

  it("returns empty when no auth constructs are present (honesty)", () => {
    const root = fixture({ "util.ts": `export const x = 1;\n` });
    expect(detectAuth(root, ["util.ts"])).toEqual([]);
  });

  it("ignores guard signatures that appear only in comments", () => {
    const root = fixture({ "comments.ts": `app.get("/users", handler); // requireAuth is missing\n` });
    expect(detectAuth(root, ["comments.ts"])).toEqual([]);
  });

  it("is deterministic: sorted by path then line", () => {
    const root = fixture({ "b.ts": `requireAuth();\n`, "a.ts": `authenticate();\n` });
    const ev = detectAuth(root, ["b.ts", "a.ts"]);
    expect(ev.map((e) => e.path)).toEqual(["a.ts", "b.ts"]);
  });

  it("recognizes NestJS auth and role decorators", () => {
    const root = fixture({
      "users.controller.ts": `@Controller("users")\n@UseGuards(AuthGuard)\n@Roles("admin")\n@Get()\nlist() {}\n`,
    });

    expect(detectAuth(root, ["users.controller.ts"]).map((e) => `${e.line}:${e.signal}`)).toEqual([
      "2:auth_guard_decorator",
      "3:role_guard_decorator",
    ]);
  });

  it("recognizes Fastify and Django guard signatures", () => {
    const root = fixture({
      "fastify.ts": `import Fastify from "fastify";\nfastify.addHook("onRequest", authenticate);\n`,
      "views.py": `from django.contrib.auth.decorators import login_required\n@login_required\ndef users(request): pass\n`,
    });

    expect(detectAuth(root, ["views.py", "fastify.ts"]).map((e) => `${e.path}:${e.line}:${e.signal}`)).toEqual([
      "fastify.ts:2:auth_guard",
      "views.py:2:auth_guard_decorator",
    ]);
  });
});
