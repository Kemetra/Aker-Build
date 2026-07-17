import { describe, it, expect } from "vitest";
import type { Evidence } from "@aker-build/project-map";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectDataAccess } from "../src/detect/data-access.js";
import { assemble } from "../src/assemble.js";
import { listFiles } from "../src/index.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tg-da-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("data-access evidence vocabulary", () => {
  it("uses the normative Evidence shape with signal-encoded tenant scoping", () => {
    const ev: Evidence = {
      type: "line",
      path: "apps/api/users.ts",
      line: 12,
      signal: "no_tenant_filter",
      confidence: "high",
    };
    expect(ev.signal).toBe("no_tenant_filter");
  });
});

describe("detectDataAccess", () => {
  it("flags an ORM query with no tenant filter as signal no_tenant_filter", () => {
    const root = fixture({
      "users.ts": `export const all = () => db.user.findMany({ where: { active: true } });\n`,
    });
    const ev = detectDataAccess(root, ["users.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      type: "line",
      path: "users.ts",
      line: 1,
      signal: "no_tenant_filter",
      confidence: "medium",
    });
  });

  it("marks a query carrying a tenant_id token as signal tenant_scoped", () => {
    const root = fixture({
      "users.ts": `export const mine = (t) => db.user.findMany({ where: { tenant_id: t } });\n`,
    });
    const ev = detectDataAccess(root, ["users.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]?.signal).toBe("tenant_scoped");
  });

  it("returns an empty array when there are no query sites (honesty default)", () => {
    const root = fixture({ "util.ts": `export const add = (a, b) => a + b;\n` });
    expect(detectDataAccess(root, ["util.ts"])).toEqual([]);
  });

  it("is deterministic: sorted by path then line", () => {
    const root = fixture({
      "b.ts": `db.order.findMany();\n`,
      "a.ts": `db.user.findMany();\ndb.user.findFirst();\n`,
    });
    const ev = detectDataAccess(root, ["b.ts", "a.ts"]);
    expect(ev.map((e) => `${e.path}:${e.line}`)).toEqual(["a.ts:1", "a.ts:2", "b.ts:1"]);
  });

  it("skips non-source files and unreadable paths without throwing", () => {
    const root = fixture({ "data.json": `{"db.user.findMany": true}\n` });
    expect(detectDataAccess(root, ["data.json", "missing.ts"])).toEqual([]);
  });

  it("classifies a multi-line ORM call with the tenant token in the statement window as tenant_scoped (medium)", () => {
    const root = fixture({
      "invoices.ts": `export function list(prisma, tenantId) {\n  return prisma.invoice.findMany({\n    where: { tenantId },\n  });\n}\n`,
    });
    const ev = detectDataAccess(root, ["invoices.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ line: 2, signal: "tenant_scoped", confidence: "medium" });
  });

  it("ignores bare array/Map method calls (no db-ish receiver)", () => {
    const root = fixture({
      "util.ts": `export const active = (users) => users.find((u) => u.active);\nexport const drop = (m, k) => m.delete(k);\n`,
    });
    expect(detectDataAccess(root, ["util.ts"])).toEqual([]);
  });

  it("still counts raw SQL regardless of receiver", () => {
    const root = fixture({
      "raw.ts": `export const q = () => run("SELECT id FROM invoices WHERE status = 'open'");\n`,
    });
    const ev = detectDataAccess(root, ["raw.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]?.signal).toBe("no_tenant_filter");
  });
});

describe("assemble integrates data_access evidence", () => {
  it("populates map.data_access from detected query sites", () => {
    const root = fixture({
      "package.json": `{"name":"x"}`,
      "api/users.ts": `db.user.findMany({ where: { tenant_id: t } });\n`,
    });
    const { map } = assemble(root, listFiles);
    expect(map.data_access).toEqual([
      { type: "line", path: "api/users.ts", line: 1, signal: "tenant_scoped", confidence: "high" },
    ]);
  });

  it("omits or empties data_access when there are no query sites", () => {
    const root = fixture({ "package.json": `{"name":"x"}`, "readme.md": `hi\n` });
    const { map } = assemble(root, listFiles);
    expect(map.data_access ?? []).toEqual([]);
  });
});
