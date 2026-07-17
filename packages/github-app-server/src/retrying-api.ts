import type { RuntimeGitHubApi } from "./github-api.js";
import { retryTransient, type RetryOptions } from "./retry.js";

/**
 * Retry only reads and idempotent updates. Create retries belong to the re-find lifecycle wrapper.
 *
 * `updateCheckRun` is excluded from retry when its payload carries annotations: the Checks API
 * appends annotations on each update rather than replacing them, so a transient failure that GitHub
 * actually accepted before responding would duplicate them on retry and can exhaust the
 * 50-annotation limit. An empty-annotations update is safely retried. `updateInProgressCheckRun`
 * never carries annotations, so it always retries.
 */
export function makeRetryingGitHubApi(api: RuntimeGitHubApi, options: RetryOptions = {}): RuntimeGitHubApi {
  const retry = <T>(operation: () => Promise<T>) => retryTransient(operation, options);
  return {
    listChangedFiles: (args) => retry(() => api.listChangedFiles(args)),
    getPrMetadata: (args) => retry(() => api.getPrMetadata(args)),
    findCheckRun: (args) => retry(() => api.findCheckRun(args)),
    createCheckRun: (args) => api.createCheckRun(args),
    updateCheckRun: (args) => (args.payload.annotations.length > 0 ? api.updateCheckRun(args) : retry(() => api.updateCheckRun(args))),
    createInProgressCheckRun: (args) => api.createInProgressCheckRun(args),
    updateInProgressCheckRun: (args) => retry(() => api.updateInProgressCheckRun(args)),
  };
}
