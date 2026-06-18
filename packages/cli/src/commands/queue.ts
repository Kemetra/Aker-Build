import { stringify as toYaml } from "yaml";
import {
  deriveQueue,
  deriveQueueToFile,
  MissingProjectMapError,
  MissingRisksError,
  NotGitRepoError,
  InvalidQueueError,
} from "@tenantguard/queue";

export interface QueueCmdOptions {
  out?: string;
  stdout?: boolean;
  format?: "json" | "yaml";
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_OUT = ".tenantguard";

/**
 * Run the `queue` command. Returns an exit code (no process.exit, testable).
 * 0 = queue produced & valid · 1 = missing project-map.json/risks.json (run scan/gates first) ·
 * 2 = not a Git repo · 3 = internal error.
 */
export function runQueueCommand(targetPath: string, opts: QueueCmdOptions = {}): number {
  const out = opts.out ?? DEFAULT_OUT;
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));

  try {
    if (opts.stdout) {
      const queue = deriveQueue(targetPath, { out });
      print(opts.format === "yaml" ? toYaml(queue) : JSON.stringify(queue, null, 2));
      return 0;
    }
    const { outPath, queue } = deriveQueueToFile(targetPath, { out });
    printErr(`Wrote ${outPath}`);
    const ready = queue.items.filter((i) => i.status === "ready").length;
    printErr(`${queue.items.length} items (${ready} ready)`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printErr(msg);
    if (err instanceof MissingProjectMapError || err instanceof MissingRisksError) return 1;
    if (err instanceof NotGitRepoError) return 2;
    if (err instanceof InvalidQueueError) return 3;
    return 3;
  }
}
