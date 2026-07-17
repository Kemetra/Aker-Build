import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cleanupStaleWorkspaces,
  makeGitWorkspace,
  WORKSPACE_MARKER,
  type GitCommand,
  type GitRunOptions,
  type GitRunner,
} from "../src/git-workspace.js";

const TOKEN = "ghs_WORKSPACE_HARDENING_SENTINEL";
const roots: string[] = [];

function tempRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-managed-root-"));
  roots.push(root);
  return root;
}

function recordingGit(): GitRunner & { calls: Array<{ command: GitCommand; options?: GitRunOptions }> } {
  const calls: Array<{ command: GitCommand; options?: GitRunOptions }> = [];
  return {
    calls,
    run(command, _cwd, options) {
      calls.push({ command, options });
      return { stdout: "", stderr: "", code: 0 };
    },
  };
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe("managed Git workspace", () => {
  it("passes auth only in the Git child environment, never argv or URL", async () => {
    const git = recordingGit();
    const workspace = makeGitWorkspace({ git, authToken: async () => TOKEN, tmpRoot: tempRoot(), gitTimeoutMs: 3210 });
    await workspace.checkout({ owner: "org", repo: "repo", headSha: "a".repeat(40) });
    assertCommandBoundary(git);
    assertFetchAuthentication(git);
  });

  it("uses a marked wrapper and returns its separate repo child", async () => {
    const workspace = makeGitWorkspace({ git: recordingGit(), authToken: async () => TOKEN, tmpRoot: tempRoot() });
    const repoRoot = await workspace.checkout({ owner: "org", repo: "repo", headSha: "b".repeat(40) });
    const wrapper = dirname(repoRoot);
    const markerPath = join(wrapper, WORKSPACE_MARKER);

    expect(repoRoot).toBe(join(wrapper, "repo"));
    expect(existsSync(markerPath)).toBe(true);
    expect(readFileSync(markerPath, "utf8")).not.toContain(TOKEN);
    await workspace.dispose(repoRoot);
    expect(existsSync(wrapper)).toBe(false);
  });

  it("refuses to remove an untracked caller-controlled path", async () => {
    const root = tempRoot();
    const victim = join(root, "unrelated");
    mkdirSync(victim);
    writeFileSync(join(victim, "keep.txt"), "keep");
    const workspace = makeGitWorkspace({ git: recordingGit(), authToken: async () => TOKEN, tmpRoot: root });

    await expect(workspace.dispose(victim)).rejects.toThrow(/not tracked/i);
    expect(readFileSync(join(victim, "keep.txt"), "utf8")).toBe("keep");
  });

  it("refuses disposal after the ownership nonce is tampered", async () => {
    const workspace = makeGitWorkspace({ git: recordingGit(), authToken: async () => TOKEN, tmpRoot: tempRoot() });
    const repoRoot = await workspace.checkout({ owner: "org", repo: "repo", headSha: "c".repeat(40) });
    const marker = join(dirname(repoRoot), WORKSPACE_MARKER);
    const parsed = JSON.parse(readFileSync(marker, "utf8")) as Record<string, unknown>;
    writeFileSync(marker, JSON.stringify({ ...parsed, nonce: "tampered" }));

    await expect(workspace.dispose(repoRoot)).rejects.toThrow(/marker/i);
    expect(existsSync(repoRoot)).toBe(true);
  });

  it("stale cleanup removes only old, valid marked wrappers", async () => {
    const root = tempRoot();
    const workspace = makeGitWorkspace({ git: recordingGit(), authToken: async () => TOKEN, tmpRoot: root });
    const staleRepo = await workspace.checkout({ owner: "org", repo: "repo", headSha: "d".repeat(40) });
    const markerPath = join(dirname(staleRepo), WORKSPACE_MARKER);
    const marker = JSON.parse(readFileSync(markerPath, "utf8")) as Record<string, unknown>;
    writeFileSync(markerPath, JSON.stringify({ ...marker, createdAt: "2000-01-01T00:00:00.000Z" }));
    const unrelated = join(root, "aker-build-app-unowned");
    mkdirSync(unrelated);
    writeFileSync(join(unrelated, "keep.txt"), "keep");

    const result = cleanupStaleWorkspaces({ tmpRoot: root, maxAgeMs: 60_000, nowMs: Date.now() });
    expect(result).toEqual({ removed: 1, failed: 0 });
    expect(existsSync(dirname(staleRepo))).toBe(false);
    expect(existsSync(unrelated)).toBe(true);
  });
});

function assertCommandBoundary(git: ReturnType<typeof recordingGit>): void {
  const argv = git.calls.map((call) => commandText(call.command)).join(" ");
  expect(argv).not.toContain(TOKEN);
  expect(argv).not.toContain("http.extraheader");
  expect(argv).toContain("https://github.com/org/repo.git");
}

function assertFetchAuthentication(git: ReturnType<typeof recordingGit>): void {
  const fetch = git.calls.find((call) => call.command.kind === "fetch");
  const options = fetch?.options;
  const env = options?.env;
  expect(options?.timeoutMs).toBe(3210);
  expect(env).toBeDefined();
  const auth = env!;
  expect(auth.GIT_CONFIG_COUNT).toBe("1");
  expect(auth.GIT_CONFIG_KEY_0).toBe("http.extraheader");
  expect(auth.GIT_CONFIG_VALUE_0).not.toContain(TOKEN);
  expect(auth.GIT_CONFIG_VALUE_0).toContain("AUTHORIZATION: basic ");
}

function commandText(command: GitCommand): string {
  if (command.kind === "init") return `init ${command.repositoryPath}`;
  if (command.kind === "fetch") return `fetch ${command.remoteUrl} ${command.ref}`;
  return "checkout FETCH_HEAD";
}
