import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readdirSync, statSync, mkdtempSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));

/** Fixtures that must remain plain directories (no .git) to exercise the non-Git path. */
const NON_GIT_FIXTURES = new Set(["notgit"]);

/**
 * Fixtures with no on-disk source, created empty at test time. Git can't track an empty
 * directory, so the "empty repo" case has nothing to commit — it's a freshly init'd repo.
 * Listing these explicitly makes a typo'd fixture name fail loud (ENOENT) instead of
 * silently becoming a confusing empty repo.
 */
const SYNTHETIC_FIXTURES = new Set(["empty"]);

/** Cache: fixture name -> prepared path. Stable per name so re-scans hit identical bytes. */
const prepared = new Map<string, string>();

/**
 * Resolve a test fixture to a usable path.
 *
 * The scanner requires a Git repo (non-Git is out of MVP scope, asserted by non-git.test.ts).
 * Git refuses to track a nested `.git`, so committed fixtures cannot carry one. We reconstruct
 * it at test time: copy the fixture into a temp dir and `git init` there — keeping the source
 * tree pristine. `notgit` is returned as-is so its scan still throws.
 *
 * Cached per name: every call for the same fixture returns the same prepared dir, so the
 * read-only and determinism tests see stable, identical bytes across scans.
 */
export function fixture(name: string): string {
  const src = resolve(here, "fixtures", name);

  if (NON_GIT_FIXTURES.has(name)) return src;

  const cached = prepared.get(name);
  if (cached) return cached;

  const dest = join(mkdtempSync(join(tmpdir(), "tg-fixture-")), name);
  if (SYNTHETIC_FIXTURES.has(name)) {
    mkdirSync(dest, { recursive: true }); // empty repo: no files, just a git root
  } else {
    cpSync(src, dest, { recursive: true }); // throws ENOENT on a typo'd/missing fixture (intended)
  }
  initGitRepo(dest);

  prepared.set(name, dest);
  return dest;
}

/** Make `dir` a Git repo without depending on the runner's global git identity. */
function initGitRepo(dir: string): void {
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  };
  git("init", "-q");
  // Local identity so the repo is self-contained on any runner; values are irrelevant.
  git("config", "user.email", "test@aker-build.local");
  git("config", "user.name", "Aker Build Test");
}

/** Snapshot of every file path + size + mtime under a dir (for read-only verification). */
export function snapshot(root: string): Map<string, string> {
  const snap = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      // .git is scanner-skipped (io.ts SKIP_DIRS); excluding it keeps the snapshot focused
      // on the scanned source, matching what "read-only on the scanned repo" actually means.
      if (e.isDirectory() && e.name === ".git") continue;
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const s = statSync(p);
        snap.set(p, `${s.size}:${s.mtimeMs}`);
      }
    }
  };
  if (existsSync(root)) walk(root);
  return snap;
}
