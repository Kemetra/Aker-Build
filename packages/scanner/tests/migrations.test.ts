import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectMigrations } from "../src/detect/migrations.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-p1-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("detectMigrations", () => {
  it("flags a destructive DROP TABLE in a migration file", () => {
    const root = fixture({ "migrations/001_init.sql": `DROP TABLE users;\n` });
    const ev = detectMigrations(root, ["migrations/001_init.sql"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ signal: "destructive_migration", confidence: "high", line: 1 });
  });

  it("emits migration_present for a non-destructive migration", () => {
    const root = fixture({ "migrations/002_add.sql": `CREATE TABLE orders (id int);\n` });
    const ev = detectMigrations(root, ["migrations/002_add.sql"]);
    expect(ev.map((e) => e.signal)).toEqual(["migration_present"]);
  });

  it("ignores DROP outside a migration directory (scope)", () => {
    const root = fixture({ "src/util.ts": `const q = "DROP TABLE users";\n` });
    expect(detectMigrations(root, ["src/util.ts"])).toEqual([]);
  });

  it("returns empty when there are no migration files (honesty)", () => {
    const root = fixture({ "readme.md": `hi\n` });
    expect(detectMigrations(root, ["readme.md"])).toEqual([]);
  });
});
