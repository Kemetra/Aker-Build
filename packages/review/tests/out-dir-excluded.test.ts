import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { reviewLocalDiff } from "../src/review.js";
import { changedFiles } from "../src/git.js";
import { excludeOutDir } from "../src/review.js";
import { makeDiffRepo } from "./helpers.js";

describe("the reviewer's own out-dir is excluded from changed files (SC-007 self-reference)", () => {
  it("excludeOutDir drops paths under a repo-relative out-dir, keeps source", () => {
    const changed = [".aker-build/review.json", ".aker-build/queue.json", "src/a.ts"];
    expect(excludeOutDir(changed, "/repo", ".aker-build")).toEqual(["src/a.ts"]);
  });

  it("excludeOutDir is a no-op when --out is outside the repo", () => {
    const changed = ["src/a.ts"];
    expect(excludeOutDir(changed, "/repo", "/somewhere/else")).toEqual(["src/a.ts"]);
  });

  it("REAL git source: an artifact written into the out-dir does not appear as a changed file", () => {
    const repo = makeDiffRepo({
      baseline: { "src/a.ts": "1\n" },
      changes: { "src/a.ts": "2\n" },
    });
    // simulate a prior review run leaving output behind
    const outDir = join(repo, ".aker-build");
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, "review.json"), '{"verdict":"ready"}\n', "utf8");

    const report1 = reviewLocalDiff(
      { out: outDir },
      { repoRoot: repo, changedFiles: (r) => changedFiles(r), runGates: () => ({ risks: { schema_version: 1, findings: [] } }) },
    );
    expect(report1.changed_files).toEqual(["src/a.ts"]);
    expect(report1.changed_files).not.toContain(".aker-build/review.json");

    // run twice → identical (no self-reference creeping into run 2)
    const report2 = reviewLocalDiff(
      { out: outDir },
      { repoRoot: repo, changedFiles: (r) => changedFiles(r), runGates: () => ({ risks: { schema_version: 1, findings: [] } }) },
    );
    expect(JSON.stringify(report2)).toBe(JSON.stringify(report1));
  });
});
