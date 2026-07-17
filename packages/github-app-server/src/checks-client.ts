import type { ChecksClient } from "@aker-build/github-app";
import type { GitHubApi } from "./github-api.js";

/**
 * Adapt a `GitHubApi` port into the 014 `ChecksClient` interface. This is the concrete client that
 * `handleEvent` writes through — and because `postCheck` (014) routes every call through
 * `assertAllowedWrite`, the only operations that can reach GitHub are checks.create / checks.update.
 */
export function makeChecksClient(api: GitHubApi): ChecksClient {
  return {
    createCheck: (args) => api.createCheckRun(args),
    updateCheck: (args) => api.updateCheckRun(args),
    findCheck: (args) => api.findCheckRun(args),
  };
}
