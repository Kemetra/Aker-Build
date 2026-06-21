import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Workspace } from "@tenantguard/github-app";

/**
 * A git runner the workspace shells out through. Injectable so tests drive a REAL local git repo
 * (no network) and assert on its behavior. `run` returns stdout; it MUST NOT be used to log raw
 * stderr that could echo a token-bearing remote URL (secret-safety, FR-006).
 */
export interface GitRunner {
  run(args: string[], cwd: string): { stdout: string; stderr: string; code: number };
}

export interface GitWorkspaceDeps {
  git: GitRunner;
  /** Mint a per-event clone credential (token). Returned value is used transiently, never persisted. */
  authToken: () => Promise<string>;
  /** Base temp dir (default: OS tmp). Each event gets a fresh subdir. */
  tmpRoot?: string;
}

/**
 * Concrete ephemeral Workspace (FR-004/FR-011/FR-014): each event gets its OWN temp dir (so
 * concurrent events never collide), the PR head is fetched there, and the dir is removed on dispose
 * — always.
 *
 * Secret safety (FR-006, advisor): the auth token is passed via `-c http.extraheader=...` which is
 * NOT written to the repo's `.git/config` (unlike an `https://token@host` remote URL, which git
 * persists on disk and echoes in stderr). We never log raw git stderr for the same reason.
 */
export function makeGitWorkspace(deps: GitWorkspaceDeps): Workspace {
  const tmpRoot = deps.tmpRoot ?? tmpdir();

  return {
    async checkout({ owner, repo, headSha }) {
      const dir = mkdtempSync(join(tmpRoot, "tg-app-"));
      // If ANY step fails, remove the partial dir before throwing so no source is left on disk
      // (FR-011/SC-005). The workspace owns cleanup of its own partial state; the caller's dispose
      // only runs on the success path.
      try {
        const token = await deps.authToken();
        // Token travels ONLY as an in-memory extraheader arg — never persisted to .git/config.
        const authHeader = `http.extraheader=AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
        const url = `https://github.com/${owner}/${repo}.git`;

        const init = deps.git.run(["-c", authHeader, "init", "--quiet", dir], tmpRoot);
        if (init.code !== 0) throw new WorkspaceError("git init failed");
        // `--` separates options from positionals so a crafted url/sha can never be read as a flag
        // (defense-in-depth; the webhook schema already constrains headSha to hex).
        const fetch = deps.git.run(["-c", authHeader, "fetch", "--depth", "1", "--", url, headSha], dir);
        if (fetch.code !== 0) throw new WorkspaceError("git fetch failed for the PR head ref");
        const co = deps.git.run(["-c", authHeader, "checkout", "--quiet", "FETCH_HEAD"], dir);
        if (co.code !== 0) throw new WorkspaceError("git checkout failed");
        return dir;
      } catch (err) {
        if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
        throw err;
      }
    },

    async dispose(repoRoot) {
      if (repoRoot && existsSync(repoRoot)) {
        rmSync(repoRoot, { recursive: true, force: true });
      }
    },
  };
}

/** A checkout failure — its message NEVER contains the token or the remote URL (FR-006). */
export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}
