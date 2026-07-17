import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { incompletePayload } from "@aker-build/github-app";
import { loadCredentials, type AppCredentials } from "./config.js";
import { makeGitHubApi, type OctokitLike } from "./octokit-api.js";
import { cleanupStaleWorkspaces, makeGitWorkspace, type ManagedWorkspace } from "./git-workspace.js";
import { makeNodeGit } from "./node-git.js";
import { makeAuthToken } from "./auth.js";
import { dispatch, type DispatchDeps, type DispatchResult } from "./server.js";
import { loadRuntimeConfig, type RuntimeConfig } from "./runtime-config.js";
import { makeRetryingGitHubApi } from "./retrying-api.js";
import { makeCheckStarter } from "./check-lifecycle.js";
import { createIntakeController, DeliveryCache } from "./intake.js";
import { BoundedJobQueue } from "./queue.js";
import { RuntimeMetrics } from "./metrics.js";
import { createStructuredLogger } from "./structured-log.js";
import { ForkWorkerExecutor, spawnWorkerChild } from "./worker-executor.js";
import { startRuntimeServer, type RuntimeServer, type RuntimeService } from "./runtime-host.js";
import type { RuntimeGitHubApi } from "./github-api.js";
import type { RetryOptions } from "./retry.js";

export { BodyTooLargeError, MAX_BODY_BYTES, readBody } from "./http-body.js";

/**
 * Pure request handling: given the raw body + signature header, run `dispatch` and map its result to
 * an HTTP status. Separated from the socket so it is unit-testable without binding a port. `dispatch`
 * already returns only secret-free reasons; we never echo credential material.
 */
export async function handleRequest(
  rawBody: string,
  signature: string | undefined,
  deps: DispatchDeps,
): Promise<{ status: number; body: string }> {
  const result: DispatchResult = await dispatch(rawBody, signature, deps);
  switch (result.status) {
    case 200:
      return { status: 200, body: JSON.stringify({ ok: true, checkId: result.checkId }) };
    case 202:
      return { status: 202, body: JSON.stringify({ ok: true, ignored: result.reason }) };
    case 401:
      return { status: 401, body: JSON.stringify({ ok: false, error: result.reason }) };
    case 502:
      return { status: 502, body: JSON.stringify({ ok: false, error: result.reason }) };
  }
}

/**
 * Compose the runtime from env credentials + concrete adapters. The installation id is captured here
 * (single-tenant): an operator sets `AKER_BUILD_INSTALLATION_ID`. Credentials never leave this
 * process; the per-event token is minted transiently by the workspace and discarded.
 */
export interface ComposedDispatchDeps extends DispatchDeps {
  workspace: ManagedWorkspace;
}

export function composeDeps(
  env: Record<string, string | undefined> = process.env,
  runtime: RuntimeConfig = loadRuntimeConfig(env),
  retryOptions: RetryOptions = {},
): ComposedDispatchDeps {
  const creds: AppCredentials = loadCredentials(env);
  const installationId = readInstallationId(env);

  // Authenticate the REST client as the installation via @octokit/auth-app: octokit mints and
  // refreshes the installation token internally for `pulls.*` / `checks.*` calls. The PEM is held
  // only in memory by octokit's auth strategy and never surfaced (Principle VII).
  const api = makeRetryingGitHubApi(createAuthenticatedApi(creds, installationId), retryOptions);
  const workspace = makeGitWorkspace({
    git: makeNodeGit(),
    authToken: makeAuthToken({ creds, installationId }),
    tmpRoot: runtime.tmpRoot,
    gitTimeoutMs: runtime.gitTimeoutMs,
  });

  // The review package scans both archived webhook-SHA checkouts inside the worker's inherited
  // budget; the composition root supplies only the GitHub port and managed checkout boundary.
  return { api, workspace, webhookSecret: creds.webhookSecret };
}

export function composeRuntime(env: Record<string, string | undefined> = process.env): RuntimeService {
  const config = loadRuntimeConfig(env);
  const creds = loadCredentials(env);
  const installationId = readInstallationId(env);
  const metrics = new RuntimeMetrics();
  const logger = createStructuredLogger();
  const baseApi = createAuthenticatedApi(creds, installationId);
  const retryOptions = { onRetry: () => metrics.increment("github_retry_total") };
  const api = makeRetryingGitHubApi(baseApi, retryOptions);
  const cleanup = () => cleanupStaleWorkspaces({
    tmpRoot: config.tmpRoot,
    maxAgeMs: config.staleWorkspaceAgeMs,
  });
  const startupCleanup = cleanup();
  if (startupCleanup.failed > 0) metrics.increment("workspace_cleanup_failure_total", startupCleanup.failed);

  const executor = new ForkWorkerExecutor({
    spawn: spawnWorkerChild,
    timeoutMs: config.jobTimeoutMs,
    completeNeutral: async (job, reason) => {
      await api.updateCheckRun({
        owner: job.event.owner,
        repo: job.event.repo,
        checkId: job.checkId,
        payload: incompletePayload(reason),
      });
    },
  });

  const queue = new BoundedJobQueue({
    concurrency: config.workerConcurrency,
    maxWaiting: config.maxWaitingJobs,
    execute: async (job) => {
      metrics.increment("processing_total");
      const started = Date.now();
      const result = await executor.execute(job);
      if (result.githubRetries > 0) metrics.increment("github_retry_total", result.githubRetries);
      if (result.code === "success") metrics.increment("outcome_success_total");
      else if (result.code === "failure") metrics.increment("outcome_failure_total");
      else {
        metrics.increment("outcome_neutral_total");
        if (result.code === "worker_timeout") metrics.increment("timeout_total");
        if (result.code === "scan_budget_exceeded") metrics.increment("budget_exhaustion_total");
      }
      logger.log({
        event: "delivery_completed",
        deliveryHash: job.deliveryHash,
        owner: job.event.owner,
        repo: job.event.repo,
        prNumber: job.event.prNumber,
        outcome: result.code === "success" || result.code === "failure" ? result.code : "neutral",
        durationMs: Date.now() - started,
      });
    },
  });
  const intake = createIntakeController({
    webhookSecret: creds.webhookSecret,
    installationId,
    queue,
    checks: makeCheckStarter(baseApi, retryOptions),
    deliveryCache: new DeliveryCache({ ttlMs: config.deliveryTtlMs, maxEntries: config.deliveryCacheEntries }),
    checkStartTimeoutMs: config.checkStartTimeoutMs,
  });

  return { intake, queue, executor, metrics, config, cleanup };
}

/**
 * Validate the single-tenant installation id from the environment. Same fail-fast-without-leaking
 * contract as `loadCredentials` (FR-007): a missing/empty/non-integer/non-positive value throws an
 * error that NAMES the variable but never echoes the offending value.
 */
export function readInstallationId(env: Record<string, string | undefined>): number {
  const raw = env.AKER_BUILD_INSTALLATION_ID;
  const id = raw ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    // Names the variable; never prints a value (FR-007).
    throw new Error("missing or invalid required environment variable: AKER_BUILD_INSTALLATION_ID");
  }
  return id;
}

/** Start the bounded production runtime. No checkout or scan runs on the HTTP event loop. */
export function start(runtime: RuntimeService = composeRuntime(), port?: number): RuntimeServer {
  return startRuntimeServer(runtime, { ...(port !== undefined ? { port } : {}), installSignalHandlers: true });
}

function createAuthenticatedApi(creds: AppCredentials, installationId: number): RuntimeGitHubApi {
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: creds.appId, privateKey: creds.privateKey, installationId },
  });
  return makeGitHubApi(octokit as unknown as OctokitLike);
}
