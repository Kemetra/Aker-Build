import { spawnSync } from "node:child_process";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  CONFIG_FILENAMES,
  ConfigSecretError,
  loadConfig,
  renderStarterConfig,
  type ConfigFormat,
} from "@aker-build/config";

export type InitExitCode = 0 | 1 | 2 | 3;

export interface InitOptions {
  format?: ConfigFormat;
  stdout?: boolean;
  sink?: (text: string) => void;
  errSink?: (line: string) => void;
}

export interface InitDeps {
  isGitRepository: (repoRoot: string) => boolean;
  writeExclusive: (path: string, content: string) => void;
}

const DEFAULT_DEPS: InitDeps = {
  isGitRepository(repoRoot) {
    const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
      cwd: repoRoot,
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    return result.status === 0 && result.stdout.trim() === "true";
  },
  writeExclusive(path, content) {
    writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
  },
};

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function configPaths(repoRoot: string): string[] {
  return CONFIG_FILENAMES
    .map((name) => resolve(repoRoot, name))
    .filter((candidate) => existsSync(candidate));
}

function validateExistingConfig(repoRoot: string, path: string): string | null {
  try {
    loadConfig(repoRoot, { configPath: path });
    return null;
  } catch (error) {
    if (error instanceof ConfigSecretError) return error.message;
    return `Aker Build config is invalid or unreadable: ${path}`;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "EEXIST";
}

export function runInit(
  targetPath: string,
  opts: InitOptions = {},
  deps: InitDeps = DEFAULT_DEPS,
): InitExitCode {
  const repoRoot = resolve(targetPath);
  const format = opts.format ?? "yaml";
  const sink = opts.sink ?? ((text: string) => process.stdout.write(text));
  const printErr = opts.errSink ?? ((line: string) => process.stderr.write(`${line}\n`));
  const fail = (code: 1 | 2 | 3, message: string): 1 | 2 | 3 => {
    printErr(message);
    return code;
  };

  if (format !== "yaml" && format !== "json") {
    return fail(2, `Unsupported config format: ${String(format)} (expected yaml or json)`);
  }
  if (!isDirectory(repoRoot)) return fail(2, `Repository path is not a directory: ${repoRoot}`);
  if (!deps.isGitRepository(repoRoot)) return fail(1, `Not a Git repository: ${repoRoot}`);

  if (opts.stdout) {
    sink(renderStarterConfig(format));
    return 0;
  }

  const existing = configPaths(repoRoot);
  if (existing.length > 1) {
    return fail(2, "Multiple Aker Build config files found; keep exactly one recognized format.");
  }
  if (existing.length === 1) {
    const error = validateExistingConfig(repoRoot, existing[0]!);
    if (error) return fail(2, error);
    sink(`Aker Build already initialized: ${existing[0]}\n`);
    return 0;
  }

  const filename = format === "json" ? "aker-build.config.json" : "aker-build.config.yaml";
  const destination = resolve(repoRoot, filename);
  try {
    deps.writeExclusive(destination, renderStarterConfig(format));
    sink(`Initialized Aker Build: ${destination}\n`);
    return 0;
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      const raced = configPaths(repoRoot);
      if (raced.length === 1) {
        const validationError = validateExistingConfig(repoRoot, raced[0]!);
        if (!validationError) {
          sink(`Aker Build already initialized: ${raced[0]}\n`);
          return 0;
        }
        return fail(2, validationError);
      }
      if (raced.length > 1) {
        return fail(2, "Multiple Aker Build config files found; keep exactly one recognized format.");
      }
      return fail(2, `Aker Build config appeared concurrently but could not be read: ${destination}`);
    }
    return fail(3, `Failed to create Aker Build config: ${destination}`);
  }
}
