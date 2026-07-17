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

/** Build the `aker-build` CLI program. Commands set process.exitCode (no hard process.exit). */
export function buildProgram(): Command {
  const program = new Command();
  program
    .name("aker-build")
    .description("Aker Build — CLI-first SaaS Build Kernel")
    .version("0.0.0");
  registerCommands(program);
  return program;
}

function registerCommands(program: Command): void {
  addScanCommand(program);
  addMapCommand(program);
  addGatesCommand(program);
  addQueueCommand(program);
  addRouteCommand(program);
  addPromptCommand(program);
  addReviewCommand(program);
  addReportCommand(program);
}

interface PathCommandDefinition {
  name: string;
  description: string;
}

interface FormattedOutputDefinition {
  out: string;
  stdout: string;
  format: string;
  defaultFormat: string;
}

interface TextOutputDefinition {
  out: string;
  stdout: string;
}

function pathCommand(program: Command, definition: PathCommandDefinition): Command {
  return program.command(definition.name).description(definition.description).argument("[path]", "target repo path", ".");
}

function formattedOutput(command: Command, definition: FormattedOutputDefinition): Command {
  return command
    .option("--out <dir>", definition.out, ".aker-build")
    .option("--stdout", definition.stdout)
    .option("--format <fmt>", definition.format, definition.defaultFormat);
}

function formattedOutputWithoutStdout(command: Command, definition: Omit<FormattedOutputDefinition, "stdout">): Command {
  return command
    .option("--out <dir>", definition.out, ".aker-build")
    .option("--format <fmt>", definition.format, definition.defaultFormat);
}

function textOutput(command: Command, definition: TextOutputDefinition): Command {
  return command.option("--out <dir>", definition.out, ".aker-build").option("--stdout", definition.stdout);
}

function addScanCommand(program: Command): void {
  formattedOutput(pathCommand(program, {
    name: "scan",
    description: "Scan a local repo (read-only) and produce a Project Map",
  }), {
    out: "output directory (outside scanned tracked source)",
    stdout: "print the map to stdout instead of writing a file",
    format: "json | yaml",
    defaultFormat: "json",
  })
    .option("--config <path>", "explicit aker-build.config.json/yaml path")
    .action((path: string, opts: { out: string; config?: string; stdout?: boolean; format: "json" | "yaml" }) => {
      process.exitCode = runScan(path, opts);
    });
}

function addMapCommand(program: Command): void {
  formattedOutputWithoutStdout(program.command("map").description("Show / re-emit the produced Project Map"), {
    out: "directory holding the produced map",
    format: "json | yaml",
    defaultFormat: "json",
  })
    .action((opts: { out: string; format: "json" | "yaml" }) => {
      process.exitCode = runMap(opts);
    });
}

function addGatesCommand(program: Command): void {
  formattedOutput(pathCommand(program, {
    name: "gates",
    description: "Run the SaaS gate set (or a subset) over the scanned repo, produce risks.json",
  }), {
    out: "output directory (holds project-map.json; risks.json written here)",
    stdout: "print risks.json to stdout instead of writing a file",
    format: "json | yaml",
    defaultFormat: "json",
  })
    .option("--gates <ids>", "comma-separated gate ids to run, e.g. TG-G4,TG-G5")
    .option("--config <path>", "explicit aker-build.config.json/yaml path")
    .action(
      (path: string, opts: { out: string; gates?: string; config?: string; stdout?: boolean; format: "json" | "yaml" }) => {
        process.exitCode = runGatesCommand(path, opts);
      },
    );
}

/**
 * Shared shape for `queue`/`route`/`report`: a formatted path command whose runner takes (path, opts).
 * Generic over the runner's options so each command keeps its own `format` union; commander supplies
 * the parsed options object at runtime.
 */
function addFormattedPathCommand<TOptions extends { out: string; stdout?: boolean }>(
  program: Command,
  path: PathCommandDefinition,
  output: FormattedOutputDefinition,
  run: (targetPath: string, opts: TOptions) => number,
): void {
  formattedOutput(pathCommand(program, path), output)
    .action((targetPath: string, opts: TOptions) => {
      process.exitCode = run(targetPath, opts);
    });
}

function addQueueCommand(program: Command): void {
  addFormattedPathCommand(
    program,
    { name: "queue", description: "Derive queue.json from the project map + gate findings" },
    {
      out: "output directory (holds project-map.json + risks.json; queue.json written here)",
      stdout: "print queue.json to stdout instead of writing a file",
      format: "json | yaml",
      defaultFormat: "json",
    },
    runQueueCommand,
  );
}

function addRouteCommand(program: Command): void {
  addFormattedPathCommand(
    program,
    { name: "route", description: "Select one next-safest task (with reason) + list blocked items" },
    {
      out: "directory holding queue.json; route.json written here",
      stdout: "print the full decision JSON to stdout",
      format: "json | yaml",
      defaultFormat: "json",
    },
    runRouteCommand,
  );
}

function addPromptCommand(program: Command): void {
  textOutput(program
    .command("prompt")
    .description("Compile a safe, scoped agent prompt for a queue item")
    .argument("<id>", "queue item id, e.g. Q-001")
    .option("--agent <name>", "claude | codex | generic", "generic"), {
    out: "directory holding queue.json; prompt-<id>.md written here",
    stdout: "print the prompt only (do not write a file)",
  })
    .action((id: string, opts: { agent?: string; out: string; stdout?: boolean }) => {
      process.exitCode = runPromptCommand(id, opts);
    });
}

function addReviewCommand(program: Command): void {
  formattedOutput(program
    .command("review-pr")
    .description("Review a local diff (or GitHub PR) against the gates + declared scope → Ready / Not Ready / Needs Verification")
    .argument("[target]", "target repo path (with --local-diff) or a PR number", ".")
    .option("--local-diff", "review the current local working diff (no credentials)")
    .option("--base <ref>", "local mode: compare the working tree against this commit-ish (default HEAD)")
    .option("--item <id>", "check changed files against this queue item's allowed/forbidden files")
    .option("--config <path>", "explicit aker-build.config.json/yaml path"), {
    out: "directory holding project-map.json (+ queue.json for --item); review.json/review.md written here",
    stdout: "print the report only (do not write files)",
    format: "json | yaml",
    defaultFormat: "json",
  })
    .action(
      (
        target: string,
        opts: { localDiff?: boolean; base?: string; item?: string; config?: string; out: string; stdout?: boolean; format: "json" | "yaml" },
      ) => {
        process.exitCode = runReviewCommand(target, opts);
      },
    );
}

function addReportCommand(program: Command): void {
  addFormattedPathCommand(
    program,
    { name: "report", description: "Summarize produced Aker Build artifacts into aker-build-report.json and Markdown" },
    {
      out: "directory holding produced artifacts; report files written here",
      stdout: "print the report instead of writing files",
      format: "json | yaml | md",
      defaultFormat: "json",
    },
    runReportCommand,
  );
}
