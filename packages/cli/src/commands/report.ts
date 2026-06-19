import { stringify as toYaml } from "yaml";
import {
  buildReport,
  writeReportToFiles,
  renderReportMarkdown,
  InvalidReportError,
  InvalidReportInputError,
} from "@tenantguard/report";

export interface ReportCmdOptions {
  out?: string;
  stdout?: boolean;
  format?: "json" | "yaml" | "md";
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_OUT = ".tenantguard";

/**
 * Run the `report` command. Returns an exit code (no process.exit, testable).
 * 0 = report produced · 2 = invalid input artifact · 3 = internal report error.
 */
export function runReportCommand(targetPath: string, opts: ReportCmdOptions = {}): number {
  const out = opts.out ?? DEFAULT_OUT;
  const format = opts.format ?? "json";
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));

  try {
    if (opts.stdout) {
      const report = buildReport(targetPath, { out });
      if (format === "md") print(renderReportMarkdown(report));
      else print(format === "yaml" ? toYaml(report) : JSON.stringify(report, null, 2));
      return 0;
    }
    const { jsonPath, mdPath, report } = writeReportToFiles(targetPath, { out });
    printErr(`Wrote ${jsonPath}`);
    printErr(`Wrote ${mdPath}`);
    printErr(`${report.summary.findings.total} findings, ${report.summary.queue.total} queue items`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printErr(msg);
    if (err instanceof InvalidReportInputError) return 2;
    if (err instanceof InvalidReportError) return 3;
    return 3;
  }
}
