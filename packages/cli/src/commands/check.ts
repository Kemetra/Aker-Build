import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runScan, type ScanCmdOptions } from "./scan.js";
import { runGatesCommand, type GatesCmdOptions } from "./gates.js";
import { runQueueCommand, type QueueCmdOptions } from "./queue.js";
import { runRouteCommand, type RouteCmdOptions } from "./route.js";
import { runReportCommand, type ReportCmdOptions } from "./report.js";

export const CHECK_ARTIFACTS = [
  "project-map.json",
  "risks.json",
  "queue.json",
  "route.json",
  "aker-build-report.json",
  "aker-build-report.md",
] as const;

export type CheckExitCode = 0 | 1 | 2 | 3;

export interface CheckCmdOptions {
  out?: string;
  config?: string;
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

export interface CheckDeps {
  scan: (target: string, opts: ScanCmdOptions) => number;
  gates: (target: string, opts: GatesCmdOptions) => number;
  queue: (target: string, opts: QueueCmdOptions) => number;
  route: (target: string, opts: RouteCmdOptions) => number;
  report: (target: string, opts: ReportCmdOptions) => number;
}

const DEFAULT_DEPS: CheckDeps = {
  scan: runScan,
  gates: runGatesCommand,
  queue: runQueueCommand,
  route: runRouteCommand,
  report: runReportCommand,
};

function promote(staged: string, output: string): void {
  for (const file of CHECK_ARTIFACTS) {
    if (!existsSync(join(staged, file))) throw new Error(`check stage output missing: ${file}`);
  }

  mkdirSync(output, { recursive: true });
  const transaction = `${process.pid}-${Date.now()}`;
  const nextPaths = new Map<string, string>();
  const previousPaths = new Map<string, string>();
  const promoted = new Set<string>();

  try {
    for (const file of CHECK_ARTIFACTS) {
      const next = join(output, `.${basename(file)}.${transaction}.next`);
      copyFileSync(join(staged, file), next);
      nextPaths.set(file, next);
    }

    for (const file of CHECK_ARTIFACTS) {
      const destination = join(output, file);
      if (!existsSync(destination)) continue;
      const previous = join(output, `.${basename(file)}.${transaction}.previous`);
      renameSync(destination, previous);
      previousPaths.set(file, previous);
    }

    for (const file of CHECK_ARTIFACTS) {
      renameSync(nextPaths.get(file)!, join(output, file));
      promoted.add(file);
    }

    for (const previous of previousPaths.values()) rmSync(previous, { force: true });
  } catch (error) {
    for (const file of promoted) rmSync(join(output, file), { force: true });
    for (const [file, previous] of previousPaths) {
      if (existsSync(previous)) renameSync(previous, join(output, file));
    }
    throw error;
  } finally {
    for (const next of nextPaths.values()) rmSync(next, { force: true });
    for (const previous of previousPaths.values()) rmSync(previous, { force: true });
  }
}

export function runCheck(
  targetPath: string,
  opts: CheckCmdOptions = {},
  deps: CheckDeps = DEFAULT_DEPS,
): CheckExitCode {
  const target = resolve(targetPath);
  const output = resolve(opts.out ?? ".aker-build");
  const config = opts.config ? resolve(opts.config) : undefined;
  const print = opts.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const printErr = opts.errSink ?? ((line: string) => process.stderr.write(`${line}\n`));
  const root = mkdtempSync(join(tmpdir(), "aker-build-check-"));
  const staged = join(root, "out");
  const diagnostics: string[] = [];
  const quiet = {
    sink: (_line: string): void => {},
    errSink: (line: string): void => {
      diagnostics.push(line);
    },
  };
  const stages = [
    ["scan", () => deps.scan(target, { out: staged, config, ...quiet })],
    ["gates", () => deps.gates(target, { out: staged, config, ...quiet })],
    ["queue", () => deps.queue(target, { out: staged, ...quiet })],
    ["route", () => deps.route(target, { out: staged, ...quiet })],
    ["report", () => deps.report(target, { out: staged, ...quiet })],
  ] as const;

  try {
    for (const [name, run] of stages) {
      diagnostics.length = 0;
      printErr(`check: ${name}`);
      const code = run();
      if (code !== 0) {
        const detail = diagnostics.at(-1);
        printErr(`check failed at ${name} (exit ${code})${detail ? `: ${detail}` : ""}`);
        return code === 1 || code === 2 || code === 3 ? code : 3;
      }
    }

    promote(staged, output);
    print(`Aker Build check complete: ${output}`);
    return 0;
  } catch (error) {
    printErr(error instanceof Error ? error.message : String(error));
    return 3;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
