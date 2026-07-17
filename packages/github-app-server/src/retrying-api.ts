import type { RuntimeGitHubApi } from "./github-api.js";
import { retryTransient, type RetryOptions } from "./retry.js";

/** Retry only reads and idempotent updates. Create retries belong to the re-find lifecycle wrapper. */
export function makeRetryingGitHubApi(api: RuntimeGitHubApi, options: RetryOptions = {}): RuntimeGitHubApi {
  const retry = <T>(operation: () => Promise<T>) => retryTransient(operation, options);
  return {
    listChangedFiles: (args) => retry(() => api.listChangedFiles(args)),
    getPrMetadata: (args) => retry(() => api.getPrMetadata(args)),
    findCheckRun: (args) => retry(() => api.findCheckRun(args)),
    createCheckRun: (args) => api.createCheckRun(args),
    updateCheckRun: (args) => retry(() => api.updateCheckRun(args)),
    createInProgressCheckRun: (args) => api.createInProgressCheckRun(args),
    updateInProgressCheckRun: (args) => retry(() => api.updateInProgressCheckRun(args)),
  };
}
