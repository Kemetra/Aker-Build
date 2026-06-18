import { scan, scanToFile } from "@tenantguard/scanner";
import { stringify as toYaml } from "yaml";

export interface ScanCmdOptions {
  out?: string;
  stdout?: boolean;
  format?: "json" | "yaml";
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_OUT = ".tenantguard";

/**
 * Run the `scan` command. Returns an exit code (does not call process.exit, so it is testable).
 * 0 = map produced & valid · 1 = not a Git repo · 2 = internal error.
 */
export function runScan(targetPath: string, opts: ScanCmdOptions = {}): number {
  const out = opts.out ?? DEFAULT_OUT;
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));

  try {
    if (opts.stdout) {
      // Build map without writing a file.
      const { map } = scan(targetPath);
      print(opts.format === "yaml" ? toYaml(map) : JSON.stringify(map, null, 2));
      return 0;
    }
    const { outPath, result } = scanToFile(targetPath, out);
    printErr(`Wrote ${outPath}`);
    for (const note of result.notes) {
      printErr(`note(${note.kind})${note.path ? " " + note.path : ""}: ${note.message}`);
    }
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printErr(msg);
    return /not a git repository/i.test(msg) ? 1 : 2;
  }
}
