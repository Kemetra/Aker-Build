import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectStack } from "../src/detect/stack.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-stack-mono-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("detectStack in a workspace layout", () => {
  it("detects frameworks declared in workspace packages, not just the root", () => {
    // pnpm/npm workspaces keep the root manifest dependency-free; the real stack lives in
    // packages/*. Reading only the root reports an empty stack for the layout Aker Build targets.
    const root = fixture({
      "package.json": `{"name":"ws","private":true,"devDependencies":{"typescript":"^5"}}`,
      "pnpm-workspace.yaml": `packages:\n  - "packages/*"\n`,
      "packages/api/package.json": `{"name":"api","dependencies":{"express":"^4","@prisma/client":"^5"}}`,
      "packages/web/package.json": `{"name":"web","dependencies":{"next":"^14"}}`,
    });
    const stack = detectStack(root, [
      "package.json",
      "packages/api/package.json",
      "packages/web/package.json",
    ]);
    expect(stack.frameworks).toEqual(["express", "nextjs", "prisma"]);
  });

  it("still works when given no file list (root-only behaviour preserved)", () => {
    const root = fixture({
      "package.json": `{"name":"single","dependencies":{"express":"^4"}}`,
    });
    expect(detectStack(root).frameworks).toEqual(["express"]);
  });

  it("ignores manifests inside dependency directories", () => {
    const root = fixture({
      "package.json": `{"name":"app","dependencies":{"express":"^4"}}`,
      "node_modules/vue/package.json": `{"name":"vue","dependencies":{"vue":"^3"}}`,
    });
    const stack = detectStack(root, ["package.json", "node_modules/vue/package.json"]);
    expect(stack.frameworks).toEqual(["express"]);
  });
});
