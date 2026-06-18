import { Command } from "commander";
import { runScan } from "./commands/scan.js";
import { runMap } from "./commands/map.js";

export { runScan } from "./commands/scan.js";
export { runMap } from "./commands/map.js";

/** Build the `tenantguard` CLI program. Commands set process.exitCode (no hard process.exit). */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name("tenantguard")
    .description("TenantGuard — CLI-first SaaS Build Kernel")
    .version("0.0.0");

  program
    .command("scan")
    .description("Scan a local repo (read-only) and produce a Project Map")
    .argument("[path]", "target repo path", ".")
    .option("--out <dir>", "output directory (outside scanned tracked source)", ".tenantguard")
    .option("--stdout", "print the map to stdout instead of writing a file")
    .option("--format <fmt>", "json | yaml", "json")
    .action((path: string, opts: { out: string; stdout?: boolean; format: "json" | "yaml" }) => {
      process.exitCode = runScan(path, opts);
    });

  program
    .command("map")
    .description("Show / re-emit the produced Project Map")
    .option("--out <dir>", "directory holding the produced map", ".tenantguard")
    .option("--format <fmt>", "json | yaml", "json")
    .action((opts: { out: string; format: "json" | "yaml" }) => {
      process.exitCode = runMap(opts);
    });

  return program;
}
