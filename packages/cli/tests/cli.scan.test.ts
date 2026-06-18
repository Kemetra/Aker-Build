import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rmSync, existsSync, readFileSync } from "node:fs";
import { validate } from "@tenantguard/project-map";
import { runScan } from "../src/commands/scan.js";

const here = dirname(fileURLToPath(import.meta.url));
const saas = resolve(here, "../../scanner/tests/fixtures/saas");
const notgit = resolve(here, "../../scanner/tests/fixtures/notgit");
const out = resolve(here, ".tmp-out");

afterEach(() => {
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
});

describe("T026 `tenantguard scan` command", () => {
  it("produces a 002-valid project-map.json and exits 0", () => {
    const code = runScan(saas, { out });
    expect(code).toBe(0);
    const file = resolve(out, "project-map.json");
    expect(existsSync(file)).toBe(true);
    expect(validate(JSON.parse(readFileSync(file, "utf8"))).ok).toBe(true);
  });

  it("exits 1 on a non-Git directory", () => {
    const code = runScan(notgit, { out });
    expect(code).toBe(1);
  });
});
