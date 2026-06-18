import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { stringify as toYaml } from "yaml";

export interface MapCmdOptions {
  out?: string;
  format?: "json" | "yaml";
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_OUT = ".tenantguard";

/**
 * Run the `map` command — show / re-emit the produced Project Map. Returns an exit code.
 * 0 = map shown · 1 = no produced map found (suggests running `scan` first).
 */
export function runMap(opts: MapCmdOptions = {}): number {
  const out = opts.out ?? DEFAULT_OUT;
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));

  const file = resolve(out, "project-map.json");
  if (!existsSync(file)) {
    printErr(`No produced map at ${file}. Run \`tenantguard scan\` first.`);
    return 1;
  }
  const map = JSON.parse(readFileSync(file, "utf8"));
  print(opts.format === "yaml" ? toYaml(map) : JSON.stringify(map, null, 2));
  return 0;
}
