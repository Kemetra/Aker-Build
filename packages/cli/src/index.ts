import { Command } from "commander";
import { runCheck } from "./commands/check.js";
import { runScan } from "./commands/scan.js";
import { runMap } from "./commands/map.js";
import { runGatesCommand } from "./commands/gates.js";
import { runQueueCommand } from "./commands/queue.js";
import { runRouteCommand } from "./commands/route.js";
import { runPromptCommand } from "./commands/prompt.js";
import { runReviewCommand } from "./commands/review.js";
import { runReportCommand } from "./commands/report.js";
import { runInit } from "./commands/init.js";
import { runDoctor } from "./commands/doctor.js";
import { CLI_VERSION } from "./version.js";

export { runCheck } from "./commands/check.js";
export { runScan } from "./commands/scan.js";
export { runMap } from "./commands/map.js";
export { runGatesCommand } from "./commands/gates.js";
export { runQueueCommand } from "./commands/queue.js";
export { runRouteCommand } from "./commands/route.js";
export { runPromptCommand } from "./commands/prompt.js";
export { runReviewCommand } from "./commands/review.js";
export { runReportCommand } from "./commands/report.js";
export { runInit } from "./commands/init.js";
export {
  diagnoseRepository,
  renderDoctorResult,
  runDoctor,
  type CommandProbeResult,
  type DoctorCheck,
  type DoctorCheckId,
  type DoctorCheckStatus,
  type DoctorDeps,
  type DoctorMode,
  type DoctorOptions,
  type DoctorResult,
} from "./commands/doctor.js";
export { CLI_VERSION } from "./version.js";

function registerCheckCommand(program: Command): void {
  program
    .command("init")
    .description("Create a minimal Aker Build config without overwriting files")
    .argument("[path]", "target Git repository path", ".")
    .option("--format <fmt>", "yaml | json", "yaml")
    .option("--stdout", "preview config only; write no file")
    .action((path: string, opts: { format: "yaml" | "json"; stdout?: boolean }) => {
      process.exitCode = runInit(path, opts);
    });

  program
    .command("doctor")
    .description("Check local or GitHub PR-mode readiness without writing files")
    .argument("[path]", "target repository path", ".")
    .option("--github", "include GitHub PR-mode prerequisites")
    .option("--format <fmt>", "text | json", "text")
    .action((path: string, opts: { github?: boolean; format: "text" | "json" }) => {
      process.exitCode = runDoctor(path, opts);
    });

  program
    .command("check")
    .description("Run scan, gates, queue, route, and report in one read-only pass")
    .argument("[path]", "target repo path", ".")
    .option("--config <path>", "explicit aker-build.config.json/yaml path")
    .option("--out <dir>", "output directory for the complete artifact set", ".aker-build")
    .action((path: string, opts: { config?: string; out: string }) => {
      process.exitCode = runCheck(path, opts);
    });
}

function registerScanCommand(program: Command): void {
  program
    .command("scan")
    .description("Scan a local repo (read-only) and produce a Project Map")
    .argument("[path]", "target repo path", ".")
    .option("--config <path>", "explicit aker-build.config.json/yaml path")
    .option("--out <dir>", "output directory (outside scanned tracked source)", ".aker-build")
    .option("--stdout", "print the map to stdout instead of writing a file")
    .option("--format <fmt>", "json | yaml", "json")
    .action((path: string, opts: { out: string; config?: string; stdout?: boolean; format: "json" | "yaml" }) => {
      process.exitCode = runScan(path, opts);
    });
}

function registerMapCommand(program: Command): void {
  program
    .command("map")
    .description("Show / re-emit the produced Project Map")
    .option("--out <dir>", "directory holding the produced map", ".aker-build")
    .option("--format <fmt>", "json | yaml", "json")
    .action((opts: { out: string; format: "json" | "yaml" }) => {
      process.exitCode = runMap(opts);
    });
}

function registerGatesCommand(program: Command): void {
  program
    .command("gates")
    .description("Run the SaaS gate set (or a subset) over the scanned repo, produce risks.json")
    .argument("[path]", "target repo path", ".")
    .option("--gates <ids>", "comma-separated gate ids to run, e.g. TG-G4,TG-G5")
    .option("--config <path>", "explicit aker-build.config.json/yaml path")
    .option("--out <dir>", "output directory (holds project-map.json; risks.json written here)", ".aker-build")
    .option("--stdout", "print risks.json to stdout instead of writing a file")
    .option("--format <fmt>", "json | yaml", "json")
    .action(
      (path: string, opts: { out: string; gates?: string; config?: string; stdout?: boolean; format: "json" | "yaml" }) => {
        process.exitCode = runGatesCommand(path, opts);
      },
    );
}

function registerQueueCommand(program: Command): void {
  program
    .command("queue")
    .description("Derive queue.json from the project map + gate findings")
    .argument("[path]", "target repo path", ".")
    .option("--out <dir>", "output directory (holds project-map.json + risks.json; queue.json written here)", ".aker-build")
    .option("--stdout", "print queue.json to stdout instead of writing a file")
    .option("--format <fmt>", "json | yaml", "json")
    .action((path: string, opts: { out: string; stdout?: boolean; format: "json" | "yaml" }) => {
      process.exitCode = runQueueCommand(path, opts);
    });
}

function registerRouteCommand(program: Command): void {
  program
    .command("route")
    .description("Select one next-safest task (with reason) + list blocked items")
    .argument("[path]", "target repo path", ".")
    .option("--out <dir>", "directory holding queue.json; route.json written here", ".aker-build")
    .option("--stdout", "print the full decision JSON to stdout")
    .option("--format <fmt>", "json | yaml", "json")
    .action((path: string, opts: { out: string; stdout?: boolean; format: "json" | "yaml" }) => {
      process.exitCode = runRouteCommand(path, opts);
    });
}

function registerPromptCommand(program: Command): void {
  program
    .command("prompt")
    .description("Compile a safe, scoped agent prompt for a queue item")
    .argument("<id>", "queue item id, e.g. Q-001")
    .option("--agent <name>", "claude | codex | generic", "generic")
    .option("--out <dir>", "directory holding queue.json; prompt-<id>.md written here", ".aker-build")
    .option("--stdout", "print the prompt only (do not write a file)")
    .action((id: string, opts: { agent?: string; out: string; stdout?: boolean }) => {
      process.exitCode = runPromptCommand(id, opts);
    });
}

function registerReviewCommand(program: Command): void {
  program
    .command("review-pr")
    .description("Review a local diff (or GitHub PR) against the gates + declared scope → Ready / Not Ready / Needs Verification")
    .argument("[target]", "target repo path (with --local-diff) or a PR number", ".")
    .option("--local-diff", "review the current local working diff (no credentials)")
    .option("--item <id>", "check changed files against this queue item's allowed/forbidden files")
    .option("--config <path>", "explicit aker-build.config.json/yaml path")
    .option("--out <dir>", "directory holding project-map.json (+ queue.json for --item); review.json/review.md written here", ".aker-build")
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
}

function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Summarize produced Aker Build artifacts into aker-build-report.json and Markdown")
    .argument("[path]", "target repo path", ".")
    .option("--out <dir>", "directory holding produced artifacts; report files written here", ".aker-build")
    .option("--stdout", "print the report instead of writing files")
    .option("--format <fmt>", "json | yaml | md", "json")
    .action((path: string, opts: { out: string; stdout?: boolean; format: "json" | "yaml" | "md" }) => {
      process.exitCode = runReportCommand(path, opts);
    });
}

/** Build the `aker-build` CLI program. Commands set process.exitCode (no hard process.exit). */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name("aker-build")
    .description("Aker Build — CLI-first SaaS Build Kernel")
    .version(CLI_VERSION);

  registerCheckCommand(program);
  registerScanCommand(program);
  registerMapCommand(program);
  registerGatesCommand(program);
  registerQueueCommand(program);
  registerRouteCommand(program);
  registerPromptCommand(program);
  registerReviewCommand(program);
  registerReportCommand(program);

  return program;
}
