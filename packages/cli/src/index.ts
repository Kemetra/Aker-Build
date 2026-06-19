import { Command } from "commander";
import { runScan } from "./commands/scan.js";
import { runMap } from "./commands/map.js";
import { runGatesCommand } from "./commands/gates.js";
import { runQueueCommand } from "./commands/queue.js";
import { runRouteCommand } from "./commands/route.js";
import { runPromptCommand } from "./commands/prompt.js";
import { runReviewCommand } from "./commands/review.js";
import { runReportCommand } from "./commands/report.js";

export { runScan } from "./commands/scan.js";
export { runMap } from "./commands/map.js";
export { runGatesCommand } from "./commands/gates.js";
export { runQueueCommand } from "./commands/queue.js";
export { runRouteCommand } from "./commands/route.js";
export { runPromptCommand } from "./commands/prompt.js";
export { runReviewCommand } from "./commands/review.js";
export { runReportCommand } from "./commands/report.js";

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
    .option("--config <path>", "explicit tenantguard.config.json/yaml path")
    .option("--out <dir>", "output directory (outside scanned tracked source)", ".tenantguard")
    .option("--stdout", "print the map to stdout instead of writing a file")
    .option("--format <fmt>", "json | yaml", "json")
    .action((path: string, opts: { out: string; config?: string; stdout?: boolean; format: "json" | "yaml" }) => {
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

  program
    .command("gates")
    .description("Run the SaaS gate set (or a subset) over the scanned repo, produce risks.json")
    .argument("[path]", "target repo path", ".")
    .option("--gates <ids>", "comma-separated gate ids to run, e.g. TG-G4,TG-G5")
    .option("--config <path>", "explicit tenantguard.config.json/yaml path")
    .option("--out <dir>", "output directory (holds project-map.json; risks.json written here)", ".tenantguard")
    .option("--stdout", "print risks.json to stdout instead of writing a file")
    .option("--format <fmt>", "json | yaml", "json")
    .action(
      (path: string, opts: { out: string; gates?: string; config?: string; stdout?: boolean; format: "json" | "yaml" }) => {
        process.exitCode = runGatesCommand(path, opts);
      },
    );

  program
    .command("queue")
    .description("Derive queue.json from the project map + gate findings")
    .argument("[path]", "target repo path", ".")
    .option("--out <dir>", "output directory (holds project-map.json + risks.json; queue.json written here)", ".tenantguard")
    .option("--stdout", "print queue.json to stdout instead of writing a file")
    .option("--format <fmt>", "json | yaml", "json")
    .action((path: string, opts: { out: string; stdout?: boolean; format: "json" | "yaml" }) => {
      process.exitCode = runQueueCommand(path, opts);
    });

  program
    .command("route")
    .description("Select one next-safest task (with reason) + list blocked items")
    .argument("[path]", "target repo path", ".")
    .option("--out <dir>", "directory holding queue.json; route.json written here", ".tenantguard")
    .option("--stdout", "print the full decision JSON to stdout")
    .option("--format <fmt>", "json | yaml", "json")
    .action((path: string, opts: { out: string; stdout?: boolean; format: "json" | "yaml" }) => {
      process.exitCode = runRouteCommand(path, opts);
    });

  program
    .command("prompt")
    .description("Compile a safe, scoped agent prompt for a queue item")
    .argument("<id>", "queue item id, e.g. Q-001")
    .option("--agent <name>", "claude | codex | generic", "generic")
    .option("--out <dir>", "directory holding queue.json; prompt-<id>.md written here", ".tenantguard")
    .option("--stdout", "print the prompt only (do not write a file)")
    .action((id: string, opts: { agent?: string; out: string; stdout?: boolean }) => {
      process.exitCode = runPromptCommand(id, opts);
    });

  program
    .command("review-pr")
    .description("Review a local diff (or GitHub PR) against the gates + declared scope → Ready / Not Ready / Needs Verification")
    .argument("[target]", "target repo path (with --local-diff) or a PR number", ".")
    .option("--local-diff", "review the current local working diff (no credentials)")
    .option("--item <id>", "check changed files against this queue item's allowed/forbidden files")
    .option("--config <path>", "explicit tenantguard.config.json/yaml path")
    .option("--out <dir>", "directory holding project-map.json (+ queue.json for --item); review.json/review.md written here", ".tenantguard")
    .option("--stdout", "print the report only (do not write files)")
    .option("--format <fmt>", "json | yaml", "json")
    .action(
      (
        target: string,
        opts: { localDiff?: boolean; item?: string; config?: string; out: string; stdout?: boolean; format: "json" | "yaml" },
      ) => {
        process.exitCode = runReviewCommand(target, opts);
      },
    );

  program
    .command("report")
    .description("Summarize produced TenantGuard artifacts into tenantguard-report.json and Markdown")
    .argument("[path]", "target repo path", ".")
    .option("--out <dir>", "directory holding produced artifacts; report files written here", ".tenantguard")
    .option("--stdout", "print the report instead of writing files")
    .option("--format <fmt>", "json | yaml | md", "json")
    .action((path: string, opts: { out: string; stdout?: boolean; format: "json" | "yaml" | "md" }) => {
      process.exitCode = runReportCommand(path, opts);
    });

  return program;
}
