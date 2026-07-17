import { spawnSync } from "node:child_process";
import { isAbsolute } from "node:path";
import type { GitCommand, GitRunner } from "./git-workspace.js";

/**
 * Concrete `GitRunner` over `node:child_process`. Synchronous `spawnSync` matches the `GitRunner`
 * contract (`run` returns a value, not a promise) and keeps the workspace's checkout sequence simple
 * and ordered.
 *
 * Secret safety (FR-006): the caller (`git-workspace.ts`) passes the auth token only via an in-memory
 * `GIT_CONFIG_*` child environment — never persisted to `.git/config`. The runner translates a
 * closed command union into argv; it never accepts arbitrary Git options or logs. `git-workspace.ts`
 * never echoes the returned `stderr` for the same reason a
 * token-bearing remote URL would: stderr can contain auth material on a failed fetch.
 */
export function makeNodeGit(): GitRunner {
  return {
    run(command, cwd, options) {
      const args = argsFor(command);
      if (!args) return { stdout: "", stderr: "", code: 1 };
      const result = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
        env: options?.env ? { ...process.env, ...options.env } : process.env,
        timeout: options?.timeoutMs,
        killSignal: "SIGKILL",
        // Never inherit stdio — capture so nothing reaches the process's own streams unredacted.
        stdio: ["ignore", "pipe", "pipe"],
      });
      return {
        stdout: result.stdout ?? "",
        stderr: result.stderr ?? "",
        // spawnSync sets status to null if the process was killed by a signal or failed to spawn;
        // treat that as a non-zero failure so callers see an honest error.
        code: result.status ?? 1,
      };
    },
  };
}

/** Build argv only for the three managed-workspace operations; reject option injection by design. */
function argsFor(command: GitCommand): string[] | null {
  switch (command.kind) {
    case "init":
      return isSafeAbsolutePath(command.repositoryPath)
        ? ["init", "--quiet", command.repositoryPath]
        : null;
    case "fetch":
      return isSafeRemoteUrl(command.remoteUrl) && isCommitSha(command.ref)
        ? ["fetch", "--depth", "1", "--", command.remoteUrl, command.ref]
        : null;
    case "checkout_fetch_head":
      return ["checkout", "--quiet", "FETCH_HEAD"];
  }
}

function isSafeAbsolutePath(value: string): boolean {
  return isAbsolute(value) && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isSafeRemoteUrl(value: string): boolean {
  if (/[\u0000-\u001f\u007f]/u.test(value)) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password) return false;
    return (url.protocol === "https:" && url.hostname === "github.com" && url.pathname.endsWith(".git"))
      || (url.protocol === "file:" && isAbsolute(decodeURIComponent(url.pathname)));
  } catch {
    return false;
  }
}

function isCommitSha(value: string): boolean {
  return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(value);
}
