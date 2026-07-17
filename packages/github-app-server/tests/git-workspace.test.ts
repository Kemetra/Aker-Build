import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { makeGitWorkspace, type GitCommand, type GitRunOptions, type GitRunner } from "../src/git-workspace.js";

const TOKEN_SENTINEL = "ghs_SECRET_TOKEN_SENTINEL_0000";

/**
 * A GitRunner that RECORDS every arg vector it is asked to run, and (importantly) does NOT echo a
 * token-bearing remote URL into stderr — it simulates a real git that succeeds. We assert on what
 * the workspace asks git to do (the leak vector is HOW the token is passed), per the advisor.
 */
function recordingGit(): GitRunner & { calls: GitCommand[]; options: Array<GitRunOptions | undefined> } {
  const calls: GitCommand[] = [];
  const options: Array<GitRunOptions | undefined> = [];
  return {
    calls,
    options,
    run(command, _cwd, runOptions) {
      calls.push(command);
      options.push(runOptions);
      return { stdout: "", stderr: "", code: 0 };
    },
  };
}

const created: string[] = [];
afterEach(() => {
  for (const d of created) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
  created.length = 0;
});

describe("git-workspace secret safety (FR-006, advisor #1)", () => {
  it("passes the token through the Git child environment, NEVER argv or token@host URL", async () => {
    const git = recordingGit();
    const tmpRoot = mkdtempSync(join(tmpdir(), "tg-test-root-"));
    created.push(tmpRoot);
    const ws = makeGitWorkspace({ git, authToken: async () => TOKEN_SENTINEL, tmpRoot });

    const dir = await ws.checkout({ owner: "org", repo: "repo", headSha: "abc123" });
    created.push(dir);

    const flat = git.calls.map(commandText);
    // The remote URL passed to fetch must be plain https — no token embedded in it.
    const fetchCall = flat.find((c) => c.includes("fetch"));
    expect(fetchCall).toContain("https://github.com/org/repo.git");
    expect(fetchCall).not.toContain(TOKEN_SENTINEL); // token is NOT in the URL
    // The token never appears in argv or as token@host.
    expect(flat.join("\n")).not.toContain(`${TOKEN_SENTINEL}@github.com`);
    expect(flat.some((c) => c.includes("http.extraheader"))).toBe(false);
    const childEnv = git.options.find((options) => options?.env?.GIT_CONFIG_KEY_0 === "http.extraheader")?.env;
    expect(childEnv?.GIT_CONFIG_VALUE_0).toContain("AUTHORIZATION: basic ");
    expect(childEnv?.GIT_CONFIG_VALUE_0).not.toContain(TOKEN_SENTINEL);
  });

  it("WorkspaceError messages never contain the token (FR-006)", async () => {
    const failingGit: GitRunner = {
      run() {
        return { stdout: "", stderr: `fatal: could not read from https://x:${TOKEN_SENTINEL}@github.com`, code: 128 };
      },
    };
    const tmpRoot = mkdtempSync(join(tmpdir(), "tg-test-root-"));
    created.push(tmpRoot);
    const ws = makeGitWorkspace({ git: failingGit, authToken: async () => TOKEN_SENTINEL, tmpRoot });
    try {
      const d = await ws.checkout({ owner: "o", repo: "r", headSha: "s" });
      created.push(d);
      throw new Error("should have thrown");
    } catch (e) {
      // The error we raise must not echo git's stderr (which here contains a token) — FR-006.
      expect((e as Error).message).not.toContain(TOKEN_SENTINEL);
    }
  });

  it("dispose removes the ephemeral dir; checkout dirs are unique per event (FR-014)", async () => {
    const git = recordingGit();
    const tmpRoot = mkdtempSync(join(tmpdir(), "tg-test-root-"));
    created.push(tmpRoot);
    const ws = makeGitWorkspace({ git, authToken: async () => TOKEN_SENTINEL, tmpRoot });

    const d1 = await ws.checkout({ owner: "o", repo: "r", headSha: "s1" });
    const d2 = await ws.checkout({ owner: "o", repo: "r", headSha: "s2" });
    created.push(d1, d2);
    expect(d1).not.toBe(d2); // isolated per event
    expect(existsSync(d1)).toBe(true);

    await ws.dispose(d1);
    expect(existsSync(d1)).toBe(false); // gone — no source left on disk (SC-005)
  });

  it("after dispose, no checked-out files remain (no .git/config with token on disk)", async () => {
    const git = recordingGit();
    const tmpRoot = mkdtempSync(join(tmpdir(), "tg-test-root-"));
    created.push(tmpRoot);
    const ws = makeGitWorkspace({ git, authToken: async () => TOKEN_SENTINEL, tmpRoot });
    const dir = await ws.checkout({ owner: "o", repo: "r", headSha: "s" });
    await ws.dispose(dir);
    // The whole dir is gone, so no .git/config (which must never hold the token anyway) survives.
    expect(existsSync(dir)).toBe(false);
  });
});

function commandText(command: GitCommand): string {
  if (command.kind === "init") return `init ${command.repositoryPath}`;
  if (command.kind === "fetch") return `fetch ${command.remoteUrl} ${command.ref}`;
  return "checkout FETCH_HEAD";
}
