import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdtempSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));

/** Fixtures that must remain plain directories (no .git) to exercise the non-Git path. */
const NON_GIT_FIXTURES = new Set(["notgit"]);

const prepared = new Map<string, string>();

/**
 * Resolve a scanner fixture to a usable path for CLI tests.
 *
 * The scanner requires a Git repo; committed fixtures can't carry a nested `.git`. Mirror the
 * scanner test helper: copy the fixture (sourced from the scanner package) into a temp dir and
 * `git init` there, leaving the source tree pristine. `notgit` is returned as-is so it still
 * fails the git check. Cached per name for stable, deterministic re-scans.
 */
export function fixture(name: string): string {
  const src = resolve(here, "../../scanner/tests/fixtures", name);

  if (NON_GIT_FIXTURES.has(name)) return src;

  const cached = prepared.get(name);
  if (cached) return cached;

  const dest = join(mkdtempSync(join(tmpdir(), "aker-build-cli-fixture-")), name);
  if (existsSync(src)) cpSync(src, dest, { recursive: true });
  else mkdirSync(dest, { recursive: true });
  initGitRepo(dest);

  prepared.set(name, dest);
  return dest;
}

function initGitRepo(dir: string): void {
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  };
  git("init", "-q");
  git("config", "user.email", "test@aker-build.local");
  git("config", "user.name", "Aker Build Test");
}
