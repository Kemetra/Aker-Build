import { stringify as toYaml } from "yaml";
import {
  runGates,
  runGatesToFile,
  MissingProjectMapError,
  NotGitRepoError,
  UnknownGateError,
  InvalidRisksError,
  ConfigError,
} from "@tenantguard/gates";

export interface GatesCmdOptions {
  out?: string;
  gates?: string;
  config?: string;
  stdout?: boolean;
  format?: "json" | "yaml";
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_OUT = ".tenantguard";

/**
 * Run the `gates` command. Returns an exit code (no process.exit, so it is testable).
 * 0 = risks.json produced & valid · 1 = no project-map.json (run scan first) ·
 * 2 = bad input (unknown --gates id / not a Git repo) · 3 = internal error.
 */
export function runGatesCommand(targetPath: string, opts: GatesCmdOptions = {}): number {
  const out = opts.out ?? DEFAULT_OUT;
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));
  const ids = opts.gates
    ? opts.gates.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    if (opts.stdout) {
      const { risks } = runGates(targetPath, { out, gates: ids, configPath: opts.config });
      print(opts.format === "yaml" ? toYaml(risks) : JSON.stringify(risks, null, 2));
      return 0;
    }
    const { outPath, result } = runGatesToFile(targetPath, { out, gates: ids, configPath: opts.config });
    printErr(`Wrote ${outPath}`);
    const findings = result.risks.findings;
    const riskCount = findings.filter((f) => f.status === "risk").length;
    printErr(`${findings.length} findings (${riskCount} risk)`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printErr(msg);
    if (err instanceof MissingProjectMapError) return 1;
    if (err instanceof NotGitRepoError || err instanceof UnknownGateError || err instanceof ConfigError) return 2;
    if (err instanceof InvalidRisksError) return 3;
    return 3;
  }
}
