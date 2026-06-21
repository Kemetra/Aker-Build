import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { afterEach, describe, it, expect } from "vitest";
import { makeGitWorkspace } from "../src/git-workspace.js";
import { makeNodeGit } from "../src/node-git.js";

/**
 * FORTIFICATION (advisor #4): exercise the REAL init → fetch --depth 1 -- <url> <sha> → checkout
 * FETCH_HEAD sequence with the REAL `makeNodeGit` runner — over a local `file://` remote (no network).
 * Every other workspace test uses a FAKE git, so the actual fetch/checkout commands have never been
 * proven to check out the right code. This closes "does the workspace actually fetch the PR head".
 */
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) if (existsSync(d)) rmSync(d, { recursive: true, force: true });
});

const git = (cwd: string, ...a: string[]) => execFileSync("git", a, { cwd, stdio: "pipe", encoding: "utf8" });

/** Create a real source repo with one commit and return { repoDir, headSha }. */
function makeOriginRepo(): { repoDir: string; headSha: string } {
  const repoDir = mkdtempSync(join(tmpdir(), "tg-origin-"));
  dirs.push(repoDir);
  git(repoDir, "init", "--quiet");
  git(repoDir, "config", "user.email", "t@t.test");
  git(repoDir, "config", "user.name", "t");
  // Allow fetching a specific SHA from this repo (git denies arbitrary-sha fetch by default).
  git(repoDir, "config", "uploadpack.allowAnySHA1InWant", "true");
  writeFileSync(join(repoDir, "marker.txt"), "the-real-head-content\n");
  git(repoDir, "add", "-A");
  git(repoDir, "commit", "--quiet", "-m", "head commit");
  const headSha = git(repoDir, "rev-parse", "HEAD").trim();
  return { repoDir, headSha };
}

describe("makeGitWorkspace over a REAL file:// remote (real init/fetch/checkout sequence)", () => {
  it("fetches the PR head SHA and checks out its real content", async () => {
    const { repoDir, headSha } = makeOriginRepo();
    const tmpRoot = mkdtempSync(join(tmpdir(), "tg-ws-root-"));
    dirs.push(tmpRoot);

    const TOKEN = "ghs_REAL_GIT_TOKEN_SENTINEL_0000";
    const ws = makeGitWorkspace({
      git: makeNodeGit(), // the REAL runner
      authToken: async () => TOKEN,
      tmpRoot,
      // Point the fetch at the local bare-ish repo via file:// — exercises the real sequence offline.
      remoteUrl: () => pathToFileURL(repoDir).href,
    });

    const checkoutDir = await ws.checkout({ owner: "o", repo: "r", headSha });
    dirs.push(checkoutDir);

    // The real fetch+checkout placed the committed file with its real content into the workspace.
    // Compare trimmed — git's autocrlf may normalize the trailing newline on Windows checkout.
    const marker = join(checkoutDir, "marker.txt");
    expect(existsSync(marker)).toBe(true);
    expect(readFileSync(marker, "utf8").trim()).toBe("the-real-head-content");

    // FR-006, the REAL property (not the tautology the reviewer flagged): after a real checkout the
    // token must NOT be persisted to .git/config on disk. The workspace passes it via an in-memory
    // `-c http.extraheader`, never as a stored remote/credential — so it must be absent from config.
    const gitConfigPath = join(checkoutDir, ".git", "config");
    if (existsSync(gitConfigPath)) {
      expect(readFileSync(gitConfigPath, "utf8")).not.toContain(TOKEN);
    }

    // dispose removes everything — no source left on disk (SC-005).
    await ws.dispose(checkoutDir);
    expect(existsSync(checkoutDir)).toBe(false);
  });

  it("throws WorkspaceError when the head SHA does not exist on the remote (real git failure)", async () => {
    const { repoDir } = makeOriginRepo();
    const tmpRoot = mkdtempSync(join(tmpdir(), "tg-ws-root-"));
    dirs.push(tmpRoot);
    const ws = makeGitWorkspace({
      git: makeNodeGit(),
      authToken: async () => "ghs_unused",
      tmpRoot,
      remoteUrl: () => pathToFileURL(repoDir).href,
    });

    const missingSha = "f".repeat(40); // valid hex, but not a commit in the origin
    // Real git fails the fetch; the workspace surfaces a fixed-message WorkspaceError (by design its
    // message is a literal — the token-redaction property is proven on the success path above and in
    // git-workspace.test.ts's stderr-bearing case, not here).
    await expect(ws.checkout({ owner: "o", repo: "r", headSha: missingSha })).rejects.toMatchObject({
      name: "WorkspaceError",
    });
  });
});
