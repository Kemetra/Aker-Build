import type { CheckStarter } from "./intake.js";
import type { RuntimeGitHubApi } from "./github-api.js";
import { retryTransient, type RetryOptions } from "./retry.js";

export function makeCheckStarter(api: RuntimeGitHubApi, options: RetryOptions = {}): CheckStarter {
  return {
    async ensureInProgress(event, context) {
      return retryTransient(
        async () => {
          const existing = await api.findCheckRun({
            owner: event.owner,
            repo: event.repo,
            headSha: event.headSha,
          });
          if (existing) {
            await api.updateInProgressCheckRun({
              owner: event.owner,
              repo: event.repo,
              checkId: existing.id,
              deliveryHash: context.deliveryHash,
              signal: context.signal,
            });
            return existing.id;
          }
          const created = await api.createInProgressCheckRun({
            owner: event.owner,
            repo: event.repo,
            headSha: event.headSha,
            deliveryHash: context.deliveryHash,
            signal: context.signal,
          });
          return created.id;
        },
        { ...options, maxAttempts: options.maxAttempts ?? 3, signal: context.signal },
      );
    },
  };
}
