// Public surface for @tenantguard/github-app-server.
// Self-hostable deployment runtime for the 014 report-only GitHub App: webhook dispatch + concrete
// GitHub Checks client + ephemeral git workspace. Report-only, stateless, secret-safe.

export { loadCredentials, MissingCredentialError, REQUIRED_ENV, type AppCredentials } from "./config.js";
export { type GitHubApi } from "./github-api.js";
export { makeChecksClient } from "./checks-client.js";
export { makeGitWorkspace, WorkspaceError, type GitRunner, type GitWorkspaceDeps } from "./git-workspace.js";
export { dispatch, type DispatchDeps, type DispatchResult } from "./server.js";

// Live-edge: concrete adapters + HTTP host that make the App run against real GitHub (015).
export { makeAuthToken, AuthError, type TokenMinter, type AuthTokenDeps } from "./auth.js";
export { makeGitHubApi, type OctokitLike } from "./octokit-api.js";
export { makeNodeGit } from "./node-git.js";
export { prepareRepo } from "./prepare-repo.js";
export {
  start,
  composeDeps,
  handleRequest,
  readBody,
  readInstallationId,
  BodyTooLargeError,
  MAX_BODY_BYTES,
} from "./http-server.js";
