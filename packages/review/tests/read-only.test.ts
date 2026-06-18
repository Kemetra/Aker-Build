import { describe, it, expect } from "vitest";
import { readdirSync, statSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { reviewLocalDiff } from "../src/review.js";
import { changedFiles } from "../src/git.js";
import { makeDiffRepo } from "./helpers.js";

/** Snapshot path → size:mtime:sha-ish for every file under root, skipping .git. */
function snapshot(root: string): Map<string, string> {
  const snap = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && e.name === ".git") continue;
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const s = statSync(p);
        snap.set(p, `${s.size}:${readFileSync(p, "utf8").length}`);
      }
    }
  };
  walk(root);
  return snap;
}

describe("review is read-only on the repo/diff (T014, SC-006, FR-008)", () => {
  it("the working tree is byte-unchanged after a review run using the REAL git source", () => {
    const repo = makeDiffRepo({
      baseline: { "src/a.ts": "export const a = 1;\n" },
      changes: { "src/a.ts": "export const a = 2;\n" },
    });
    const before = snapshot(repo);

    // Use the real changedFiles (the only path that touches the repo); inject runGates so the
    // test doesn't depend on a project-map (real gate behavior is covered in 004 + the e2e task).
    const report = reviewLocalDiff(
      { out: resolve(repo, ".tenantguard") },
      {
        changedFiles: () => changedFiles(repo),
        runGates: () => ({ risks: { schema_version: 1, findings: [] } }),
        repoRoot: repo,
      },
    );

    const after = snapshot(repo);
    expect(report.changed_files).toEqual(["src/a.ts"]);
    expect([...after.entries()]).toEqual([...before.entries()]);
  });
});
