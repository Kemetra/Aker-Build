import { ScanBudgetTracker, runWithScanBudget } from "@aker-build/scanner";
import { composeDeps, readInstallationId } from "./http-server.js";
import { loadRuntimeConfig } from "./runtime-config.js";
import { processVerifiedEvent } from "./server.js";
import {
  isWorkerParentMessage,
  type WorkerParentMessage,
  type WorkerResultMessage,
} from "./worker-executor.js";

let handled = false;

process.once("message", (message: unknown) => {
  if (handled) return;
  handled = true;
  void run(message);
});

async function run(message: unknown): Promise<void> {
  if (!isWorkerParentMessage(message)) return sendAndExit(failed());
  const config = loadRuntimeConfig(process.env);
  if (message.job.event.installationId !== readInstallationId(process.env)) return sendAndExit(failed());
  const tracker = new ScanBudgetTracker(config.scanBudget);
  let githubRetries = 0;
  const deps = composeDeps(process.env, config, { onRetry: () => { githubRetries += 1; } });
  let resultMessage: WorkerResultMessage;
  try {
    const result = await runWithScanBudget(tracker, () => processVerifiedEvent(message.job.event, deps));
    const code = result.status === 200 ? result.payload.conclusion : "worker_failed";
    resultMessage = {
      type: "result",
      code,
      ...(result.status === 200 && result.incompleteReason ? { incompleteReason: result.incompleteReason } : {}),
      usage: tracker.snapshot(),
      githubRetries,
    };
  } catch {
    resultMessage = { type: "result", code: "worker_failed", usage: tracker.snapshot(), githubRetries };
  } finally {
    await deps.workspace.disposeAll();
  }
  sendAndExit(resultMessage);
}

function failed(): WorkerResultMessage {
  return {
    type: "result",
    code: "worker_failed",
    usage: { filesConsidered: 0, filesRead: 0, bytesRead: 0 },
    githubRetries: 0,
  };
}

function sendAndExit(message: WorkerResultMessage): void {
  if (process.send) process.send(message, () => process.disconnect());
  else process.exitCode = 1;
}

export type { WorkerParentMessage };
