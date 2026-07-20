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

  it("is deterministic: sorted by path then line", () => {
    const root = fixture({ "b.ts": `requireAuth();\n`, "a.ts": `authenticate();\n` });
    const ev = detectAuth(root, ["b.ts", "a.ts"]);
    expect(ev.map((e) => e.path)).toEqual(["a.ts", "b.ts"]);
  });
});
