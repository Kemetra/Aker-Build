import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble } from "../src/assemble.js";
import { listFiles } from "../src/index.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-p1i-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("assemble surfaces all P1 detector fields", () => {
  it("populates data_access, routes, migrations, auth, config_surface from a representative repo", () => {
    const root = fixture({
      "package.json": `{"name":"x"}`,
      "api/routes.ts": `app.get("/admin/x", requireRole("a"));\n`,
      "db/queries.ts": `db.user.findMany({ where: { tenant_id: t } });\n`,
      "migrations/001.sql": `DROP TABLE old;\n`,
      "cfg.ts": `const k = process.env.K;\n`,
    });
    const { map } = assemble(root, listFiles);
    expect(map.data_access?.some((e) => e.signal === "tenant_scoped")).toBe(true);
    expect(map.routes?.some((e) => e.signal === "route_definition")).toBe(true);
    expect(map.migrations?.some((e) => e.signal === "destructive_migration")).toBe(true);
    expect(map.auth?.some((e) => e.signal === "role_guard")).toBe(true);
    expect(map.config_surface?.some((e) => e.signal === "env_var_use")).toBe(true);
  });

  it("omits/empties all P1 fields for a repo with none of these surfaces", () => {
    const root = fixture({ "package.json": `{"name":"x"}`, "readme.md": `hi\n` });
    const { map } = assemble(root, listFiles);
    expect(map.data_access ?? []).toEqual([]);
    expect(map.routes ?? []).toEqual([]);
    expect(map.migrations ?? []).toEqual([]);
    expect(map.auth ?? []).toEqual([]);
    expect(map.config_surface ?? []).toEqual([]);
  });
});
