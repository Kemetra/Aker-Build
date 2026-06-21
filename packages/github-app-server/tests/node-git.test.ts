import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  it("runs a successful git command and returns code 0 with stdout", () => {
    const git = makeNodeGit();
    const dir = tempDir();

    const init = git.run(["init", "--quiet", "."], dir);
    expect(init.code).toBe(0);

    const version = git.run(["--version"], dir);
    expect(version.code).toBe(0);
    expect(version.stdout).toMatch(/git version/);
  });

  it("reports a non-zero code for a failing git command (no throw)", () => {
    const git = makeNodeGit();
    const dir = tempDir();

    // Not a git repo + a bogus subcommand → git exits non-zero. The runner must NOT throw;
    // git-workspace.ts checks `.code` and decides. (Honest, inspectable failure.)
    const res = git.run(["rev-parse", "--verify", "HEAD"], dir);
    expect(res.code).not.toBe(0);
  });

  it("captures real command output (git config round-trip in a fresh repo)", () => {
    const git = makeNodeGit();
    const dir = tempDir();
    git.run(["init", "--quiet", "."], dir);
    git.run(["config", "user.name", "tester"], dir);
    writeFileSync(join(dir, "a.txt"), "hello");

    const status = git.run(["status", "--porcelain"], dir);
    expect(status.code).toBe(0);
    expect(status.stdout).toContain("a.txt");
  });
});
