import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { diffTrees, isLineChanged, parseNoIndexDiff } from "../src/diff.js";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function roots(): { base: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "aker-review-diff-"));
  temporaryRoots.push(root);
  const base = join(root, "base");
  const head = join(root, "head");
  mkdirSync(base);
  mkdirSync(head);
  return { base, head };
}

describe("zero-context tree diff", () => {
  it("derives added, modified, deleted, and binary head ranges from real Git output", () => {
    const { base, head } = roots();
    writeFileSync(join(base, "modified.txt"), "same\nold\nsame\n", "utf8");
    writeFileSync(join(head, "modified.txt"), "same\nnew\nsame\n", "utf8");
    writeFileSync(join(base, "deleted.txt"), "gone\n", "utf8");
    writeFileSync(join(head, "added.txt"), "one\ntwo\n", "utf8");
    writeFileSync(join(base, "binary.bin"), Buffer.from([0, 1, 2]));
    writeFileSync(join(head, "binary.bin"), Buffer.from([0, 1, 3]));

    const result = diffTrees(base, head);

    expect(result.complete).toBe(true);
    expect(result.incompleteReasons).toEqual([]);
    expect(result.changedFiles).toEqual([
      { path: "added.txt", ranges: [{ start: 1, end: 2 }], binary: false },
      { path: "binary.bin", ranges: [], binary: true },
      { path: "deleted.txt", ranges: [], binary: false },
      { path: "modified.txt", ranges: [{ start: 2, end: 2 }], binary: false },
    ]);
    expect(isLineChanged(result.changedFiles, "modified.txt", 2)).toBe(true);
    expect(isLineChanged(result.changedFiles, "modified.txt", 1)).toBe(false);
    expect(isLineChanged(result.changedFiles, "binary.bin", 1)).toBe(false);
  });

  it("returns a complete empty comparison for identical trees", () => {
    const { base, head } = roots();
    writeFileSync(join(base, "same.txt"), "same\n", "utf8");
    writeFileSync(join(head, "same.txt"), "same\n", "utf8");
    expect(diffTrees(base, head)).toEqual({ changedFiles: [], complete: true, incompleteReasons: [] });
  });

  it("maps a failed Git invocation and malformed difference to a closed incomplete reason", () => {
    const { base, head } = roots();
    const failed = diffTrees(base, head, () => ({ status: 2, stdout: "private stderr omitted" }));
    const malformed = diffTrees(base, head, () => ({ status: 1, stdout: "not a patch" }));

    expect(failed).toEqual({ changedFiles: [], complete: false, incompleteReasons: ["diff_unavailable"] });
    expect(malformed).toEqual({ changedFiles: [], complete: false, incompleteReasons: ["diff_unavailable"] });
  });

  it("rejects unsafe paths instead of exposing or accepting them", () => {
    const patch = [
      "diff --git a/base/../escape.txt b/head/../escape.txt",
      "--- a/base/../escape.txt",
      "+++ b/head/../escape.txt",
      "@@ -0,0 +1 @@",
      "+secret",
    ].join("\n");

    expect(parseNoIndexDiff(patch, "base", "head")).toBeNull();
  });
});
