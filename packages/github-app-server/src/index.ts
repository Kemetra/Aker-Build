// Public surface for @aker-build/github-app-server.
// Self-hostable deployment runtime for the 014 report-only GitHub App: webhook dispatch + concrete
// GitHub Checks client + ephemeral git workspace. Report-only, stateless, secret-safe.

export { loadCredentials, MissingCredentialError, REQUIRED_ENV, type AppCredentials } from "./config.js";
export { type GitHubApi, type RuntimeGitHubApi } from "./github-api.js";
export { makeChecksClient } from "./checks-client.js";
export {
  cleanupStaleWorkspaces,
  makeGitWorkspace,
  WORKSPACE_MARKER,
  WORKSPACE_PREFIX,
  WorkspaceDisposalError,
  WorkspaceError,
  type GitRunOptions,
  type GitRunner,
  type GitWorkspaceDeps,
  type ManagedWorkspace,
} from "./git-workspace.js";
export {
  dispatch,
  processVerifiedEvent,
  type DispatchDeps,
  type DispatchResult,
  type ProcessedEventResult,
} from "./server.js";
export { BoundedJobQueue, type DeliveryJob, type QueueReservation, type QueueStats } from "./queue.js";
export {
  createIntakeController,
  DeliveryCache,
  type CheckStarter,
  type IntakeController,
  type IntakeReason,
  type IntakeRequest,
  type IntakeResult,
} from "./intake.js";
export {
  startRuntimeServer,
  type RuntimeExecutor,
  type RuntimeServer,
  type RuntimeService,
} from "./runtime-host.js";
export { makeCheckStarter } from "./check-lifecycle.js";
export { isTransientGitHubError, retryTransient, type RetryOptions } from "./retry.js";
export { makeRetryingGitHubApi } from "./retrying-api.js";
export { loadRuntimeConfig, RuntimeConfigError, type RuntimeConfig } from "./runtime-config.js";
export { METRIC_NAMES, RuntimeMetrics, type MetricName } from "./metrics.js";
export {
  createStructuredLogger,
  type RuntimeLogEvent,
  type RuntimeLogRecord,
  type RuntimeOutcome,
} from "./structured-log.js";
export {
  ForkWorkerExecutor,
  isWorkerParentMessage,
  spawnWorkerChild,
  type WorkerChild,
  type WorkerOutcomeCode,
  type WorkerExecutionCode,
  type WorkerExecutionResult,
  type WorkerParentMessage,
  type WorkerResultMessage,
} from "./worker-executor.js";

// Live-edge: concrete adapters + HTTP host that make the App run against real GitHub (015).
export { makeAuthToken, AuthError, type TokenMinter, type AuthTokenDeps } from "./auth.js";
export { makeGitHubApi, type OctokitLike } from "./octokit-api.js";
export { makeNodeGit } from "./node-git.js";
export { prepareRepo } from "./prepare-repo.js";
export {
  start,
  composeDeps,
  composeRuntime,
  handleRequest,
  readBody,
  readInstallationId,
  BodyTooLargeError,
  MAX_BODY_BYTES,
  type ComposedDispatchDeps,
} from "./http-server.js";
