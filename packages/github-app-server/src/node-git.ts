import { spawnSync } from "node:child_process";
import type { GitRunner } from "./git-workspace.js";

/**
 * Concrete `GitRunner` over `node:child_process`. Synchronous `spawnSync` matches the `GitRunner`
 * contract (`run` returns a value, not a promise) and keeps the workspace's checkout sequence simple
 * and ordered.
 *
 * Secret safety (FR-006): the caller (`git-workspace.ts`) passes the auth token only via an in-memory
 * `-c http.extraheader=...` arg — never persisted to `.git/config`. This runner just executes argv;
 * it does not log. `git-workspace.ts` never echoes the returned `stderr` for the same reason a
 * token-bearing remote URL would: stderr can contain auth material on a failed fetch.
 */
export function makeNodeGit(): GitRunner {
  return {
    run(args, cwd) {
      const result = spawnSync("git", args, {
        cwd,
        encoding: "utf8",
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
