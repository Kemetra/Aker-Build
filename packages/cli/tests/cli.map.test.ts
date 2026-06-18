import { describe, it, expect, afterEach } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { rmSync, existsSync } from "node:fs";
import { runScan } from "../src/commands/scan.js";
import { runMap } from "../src/commands/map.js";

const here = dirname(fileURLToPath(import.meta.url));
const saas = resolve(here, "../../scanner/tests/fixtures/saas");
const out = resolve(here, ".tmp-out-map");

afterEach(() => {
  if (existsSync(out)) rmSync(out, { recursive: true, force: true });
});

describe("T027 `tenantguard map` command", () => {
  it("exits 1 with a 'run scan first' signal when no map exists", () => {
    const lines: string[] = [];
    const code = runMap({ out, sink: (s) => lines.push(s), errSink: (s) => lines.push(s) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/scan/i);
  });

  it("prints the produced map after a scan (exit 0)", () => {
    runScan(saas, { out });
    const lines: string[] = [];
    const code = runMap({ out, sink: (s) => lines.push(s) });
    expect(code).toBe(0);
    expect(lines.join("\n")).toContain("\"version\"");
  });
});
