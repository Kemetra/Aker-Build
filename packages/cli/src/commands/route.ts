import { stringify as toYaml } from "yaml";
import {
  route,
  routeToFile,
  MissingQueueError,
  NotGitRepoError,
  InvalidRouteError,
  type RouterDecision,
} from "@tenantguard/queue";

export interface RouteCmdOptions {
  out?: string;
  stdout?: boolean;
  format?: "json" | "yaml";
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_OUT = ".tenantguard";

/** Human-readable summary of a router decision (always printed). */
function summarize(d: RouterDecision): string[] {
  const lines: string[] = [];
  if (d.next) {
    lines.push(`next: ${d.next.id} — ${d.next.title}`);
    for (const r of d.next.reason) lines.push(`  reason: ${r}`);
  } else {
    lines.push("next: (no safe next task)");
    for (const r of d.no_safe_task_reasons) lines.push(`  reason: ${r}`);
  }
  if (d.blocked.length > 0) {
    lines.push("blocked:");
    for (const b of d.blocked) lines.push(`  ${b.id} — ${b.reason}`);
  }
  return lines;
}

/**
 * Run the `route` command. Returns an exit code.
 * 0 = decision produced (incl. explicit "no safe task") · 1 = missing queue.json (run queue first) ·
 * 2 = not a Git repo · 3 = internal error.
 */
export function runRouteCommand(targetPath: string, opts: RouteCmdOptions = {}): number {
  const out = opts.out ?? DEFAULT_OUT;
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));

  try {
    if (opts.stdout) {
      const decision = route(targetPath, { out });
      print(opts.format === "yaml" ? toYaml(decision) : JSON.stringify(decision, null, 2));
      return 0;
    }
    const { outPath, decision } = routeToFile(targetPath, { out });
    printErr(`Wrote ${outPath}`);
    for (const line of summarize(decision)) print(line);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printErr(msg);
    if (err instanceof MissingQueueError) return 1;
    if (err instanceof NotGitRepoError) return 2;
    if (err instanceof InvalidRouteError) return 3;
    return 3;
  }
}
