import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it, expect } from "vitest";
import { makeNodeGit } from "../src/node-git.js";

// Real local git — no network, no mocks (TDD: test real behavior). Each test gets a throwaway dir.
const dirs: string[] = [];
function tempDir(): string {
  const d = mkdtempSync(join(tmpdir(), "tg-git-test-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("makeNodeGit — concrete GitRunner over child_process", () => {
  it("runs the constrained init operation and returns code 0", () => {
    const git = makeNodeGit();
    const dir = tempDir();

    const init = git.run({ kind: "init", repositoryPath: dir }, dir);
    expect(init.code).toBe(0);
  });

  it("rejects an option-injection-shaped remote without spawning a generic Git command", () => {
    const git = makeNodeGit();
    const dir = tempDir();

    const res = git.run({ kind: "fetch", remoteUrl: "--upload-pack=evil", ref: "a".repeat(40) }, dir);
    expect(res).toEqual({ stdout: "", stderr: "", code: 1 });
  });

  it("returns a non-zero result when checkout cannot use FETCH_HEAD", () => {
    const git = makeNodeGit();
    const dir = tempDir();
    git.run({ kind: "init", repositoryPath: dir }, dir);
    const status = git.run({ kind: "checkout_fetch_head" }, dir);
    expect(status.code).not.toBe(0);
  });
});
