import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { CONFIG_FILENAMES, ConfigSecretError, loadConfig } from "@aker-build/config";

export type DoctorMode = "local" | "github";
export type DoctorCheckStatus = "pass" | "warn" | "fail";
export type DoctorCheckId =
  | "node"
  | "git"
  | "repository"
  | "config"
  | "output-ignore"
  | "gh"
  | "github-token";

export interface DoctorCheck {
  id: DoctorCheckId;
  status: DoctorCheckStatus;
  summary: string;
  remediation?: string;
}

export interface DoctorResult {
  version: 1;
  repository: string;
  mode: DoctorMode;
  status: "ready" | "needs_attention";
  checks: DoctorCheck[];
}

export interface CommandProbeResult {
  ok: boolean;
  stdout: string;
}

export interface DoctorDeps {
  nodeVersion: string;
  probe: (command: string, args: readonly string[], cwd?: string) => CommandProbeResult;
  hasEnvironmentVariable: (name: "GH_TOKEN" | "GITHUB_TOKEN") => boolean;
}

export interface DoctorOptions {
  github?: boolean;
  format?: "text" | "json";
  sink?: (text: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_DEPS: DoctorDeps = {
  nodeVersion: process.version,
  probe(command, args, cwd) {
    const result = spawnSync(command, [...args], {
      cwd,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    return {
      ok: !result.error && result.status === 0,
      stdout: typeof result.stdout === "string" ? result.stdout : "",
    };
  },
  hasEnvironmentVariable(name) {
    return Boolean(process.env[name]);
  },
};

function supportedNode(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major > 22 || (major === 22 && minor >= 13);
}

function configCheck(repoRoot: string): DoctorCheck {
  const paths = CONFIG_FILENAMES
    .map((name) => resolve(repoRoot, name))
    .filter((candidate) => existsSync(candidate));
  if (paths.length === 0) {
    return {
      id: "config",
      status: "warn",
      summary: "No Aker Build config found; zero-config defaults remain active.",
      remediation: `Run aker-build init "${repoRoot}" to create an optional starter config.`,
    };
  }
  if (paths.length > 1) {
    return {
      id: "config",
      status: "fail",
      summary: "Multiple recognized Aker Build config files are present.",
      remediation: "Keep exactly one of aker-build.config.json or aker-build.config.yaml.",
    };
  }
  try {
    loadConfig(repoRoot, { configPath: paths[0] });
    return { id: "config", status: "pass", summary: `Config is valid: ${paths[0]}` };
  } catch (error) {
    return {
      id: "config",
      status: "fail",
      summary: error instanceof ConfigSecretError
        ? `Secret-like content detected in config: ${paths[0]}`
        : `Config is invalid or unreadable: ${paths[0]}`,
      remediation: "Correct the config without copying secret values into logs.",
    };
  }
}

export function diagnoseRepository(
  targetPath: string,
  opts: { github?: boolean } = {},
  deps: DoctorDeps = DEFAULT_DEPS,
): DoctorResult {
  const repository = resolve(targetPath);
  const mode: DoctorMode = opts.github ? "github" : "local";
  const checks: DoctorCheck[] = [];

  const nodeOk = supportedNode(deps.nodeVersion);
  checks.push(nodeOk
    ? { id: "node", status: "pass", summary: `Node ${deps.nodeVersion} satisfies >=22.13.` }
    : {
        id: "node",
        status: "fail",
        summary: `Node ${deps.nodeVersion} does not satisfy >=22.13.`,
        remediation: "Install Node.js 22.13 or newer.",
      });

  const gitOk = deps.probe("git", ["--version"]).ok;
  checks.push(gitOk
    ? { id: "git", status: "pass", summary: "Git is available." }
    : { id: "git", status: "fail", summary: "Git is unavailable.", remediation: "Install Git and ensure it is on PATH." });

  const repositoryOk = gitOk
    && (() => {
      const probe = deps.probe("git", ["rev-parse", "--is-inside-work-tree"], repository);
      return probe.ok && probe.stdout.trim() === "true";
    })();
  checks.push(repositoryOk
    ? { id: "repository", status: "pass", summary: "Target is an existing Git work tree." }
    : {
        id: "repository",
        status: "fail",
        summary: "Target is not an accessible Git work tree.",
        remediation: "Run doctor from an existing Git repository.",
      });

  checks.push(configCheck(repository));

  if (repositoryOk) {
    const ignored = deps.probe("git", ["check-ignore", "--quiet", "--", ".aker-build"], repository).ok;
    checks.push(ignored
      ? { id: "output-ignore", status: "pass", summary: ".aker-build output is ignored by Git." }
      : {
          id: "output-ignore",
          status: "warn",
          summary: ".aker-build output is not ignored by Git.",
          remediation: "Add .aker-build/ to .gitignore; doctor will not edit it automatically.",
        });
  } else {
    checks.push({
      id: "output-ignore",
      status: "warn",
      summary: "Output ignore protection could not be checked without a Git work tree.",
      remediation: "After entering the repository, add .aker-build/ to .gitignore if needed.",
    });
  }

  if (mode === "github") {
    const ghOk = deps.probe("gh", ["--version"]).ok;
    checks.push(ghOk
      ? { id: "gh", status: "pass", summary: "GitHub CLI is available." }
      : { id: "gh", status: "fail", summary: "GitHub CLI is unavailable.", remediation: "Install gh and ensure it is on PATH." });

    const tokenPresent = deps.hasEnvironmentVariable("GH_TOKEN")
      || deps.hasEnvironmentVariable("GITHUB_TOKEN");
    checks.push(tokenPresent
      ? { id: "github-token", status: "pass", summary: "A supported GitHub token variable is present." }
      : {
          id: "github-token",
          status: "fail",
          summary: "No supported GitHub token variable is present.",
          remediation: "Set GH_TOKEN or GITHUB_TOKEN through CI secrets; never commit the value.",
        });
  }

  const status = checks.some((check) => check.status === "fail")
    ? "needs_attention"
    : "ready";
  return { version: 1, repository, mode, status, checks };
}

export function renderDoctorResult(result: DoctorResult, format: "text" | "json"): string {
  if (format === "json") return `${JSON.stringify(result, null, 2)}\n`;
  if (format !== "text") throw new Error(`Unsupported doctor format: ${String(format)}`);
  const lines = [
    `Aker Build doctor: ${result.status === "ready" ? "READY" : "NEEDS ATTENTION"}`,
    `Repository: ${result.repository}`,
    `Mode: ${result.mode}`,
    "",
  ];
  for (const check of result.checks) {
    lines.push(`${check.status.toUpperCase()} ${check.id}: ${check.summary}`);
    if (check.remediation) lines.push(`  Next: ${check.remediation}`);
  }
  return `${lines.join("\n")}\n`;
}

export function runDoctor(
  targetPath: string,
  opts: DoctorOptions = {},
  deps: DoctorDeps = DEFAULT_DEPS,
): 0 | 1 | 2 | 3 {
  const format = opts.format ?? "text";
  const sink = opts.sink ?? ((text: string) => process.stdout.write(text));
  const printErr = opts.errSink ?? ((line: string) => process.stderr.write(`${line}\n`));
  if (format !== "text" && format !== "json") {
    printErr(`Unsupported doctor format: ${String(format)} (expected text or json)`);
    return 2;
  }
  try {
    const result = diagnoseRepository(targetPath, { github: opts.github }, deps);
    sink(renderDoctorResult(result, format));
    return result.status === "ready" ? 0 : 1;
  } catch {
    printErr("Aker Build doctor failed unexpectedly.");
    return 3;
  }
}
