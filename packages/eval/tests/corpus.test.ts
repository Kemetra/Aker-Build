import { describe, it, expect } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { loadCases, CorpusError } from "../src/corpus.js";

const here = dirname(fileURLToPath(import.meta.url));
const CORPUS = resolve(here, "../../../benchmark/cases");

describe("loadCases", () => {
  it("loads the seed cases sorted by name with parsed labels", () => {
    const cases = loadCases(CORPUS);
    const names = cases.map((c) => c.name);
    expect(names).toContain("unprotected-admin-route");
    expect(names).toContain("clean-guarded");
    expect(names).toEqual([...names].sort()); // deterministic order

    const admin = cases.find((c) => c.name === "unprotected-admin-route")!;
    expect(admin.gates_under_test).toEqual(["TG-G4"]);
    expect(admin.expected_findings).toEqual([
      { gate_id: "TG-G4", path: "apps/api/admin.ts", tier: "confirmed" },
    ]);
    expect(admin.dir.endsWith("repo") || admin.dir.includes("repo")).toBe(true);

    const clean = cases.find((c) => c.name === "clean-guarded")!;
    expect(clean.expected_findings).toEqual([]);
  });

  it("throws a clear error when a case omits gates_under_test", () => {
    const root = mkdtempSync(join(tmpdir(), "aker-build-corpus-"));
    const caseDir = join(root, "bad-case");
    mkdirSync(join(caseDir, "repo"), { recursive: true });
    writeFileSync(join(caseDir, "expected.json"), JSON.stringify({ description: "x", expected_findings: [] }));
    expect(() => loadCases(root)).toThrow(CorpusError);
    expect(() => loadCases(root)).toThrow(/gates_under_test/);
  });

  it("throws when a case is missing its repo/ directory", () => {
    const root = mkdtempSync(join(tmpdir(), "aker-build-corpus-"));
    const caseDir = join(root, "norepo");
    mkdirSync(caseDir, { recursive: true });
    writeFileSync(
      join(caseDir, "expected.json"),
      JSON.stringify({ description: "x", gates_under_test: ["TG-G4"], expected_findings: [] }),
    );
    expect(() => loadCases(root)).toThrow(/repo/);
  });
});
