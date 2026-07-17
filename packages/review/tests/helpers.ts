import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

/** Run git in a dir without depending on the runner's global identity. */
function git(dir: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: dir, encoding: "utf8" });
}

/** Make `dir` a self-contained Git repo. */
function initGitRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.email", "test@aker-build.local"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "user.name", "Aker Build Test"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "core.autocrlf", "false"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "core.hooksPath", ".git/aker-build-no-hooks"], { cwd: dir, stdio: "ignore" });
  execFileSync("git", ["config", "core.excludesFile", ".git/aker-build-no-global-ignore"], {
    cwd: dir,
    stdio: "ignore",
  });
}

/**
 * Create a temp Git repo with `baseline` files committed, then apply `changes`:
 * - a string value overwrites/creates a tracked-or-new file (appears in the diff)
 * - `null` leaves the file untouched
 * `untracked` files are created but not added (appear via the untracked enumeration).
 * Returns the repo root. Self-contained per call (no global identity, pristine source tree).
 */
export function makeDiffRepo(opts: {
  baseline: Record<string, string>;
  changes?: Record<string, string>;
  untracked?: Record<string, string>;
}): string {
  const root = join(mkdtempSync(join(tmpdir(), "tg-review-")), "repo");
  mkdirSync(root, { recursive: true });
  initGitRepo(root);

  for (const [rel, content] of Object.entries(opts.baseline)) {
    writeFileNested(root, rel, content);
  }
  git(root, "add", ".");
  git(root, "commit", "-q", "-m", "baseline");

  for (const [rel, content] of Object.entries(opts.changes ?? {})) {
    writeFileNested(root, rel, content);
  }
  for (const [rel, content] of Object.entries(opts.untracked ?? {})) {
    writeFileNested(root, rel, content);
  }
  return root;
}

function writeFileNested(root: string, rel: string, content: string): void {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, content, "utf8");
}
