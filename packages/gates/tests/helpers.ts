import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { readdirSync, statSync, mkdtempSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { scanToFile } from "@tenantguard/scanner";

const here = dirname(fileURLToPath(import.meta.url));

/** Fixtures created empty at test time (git can't track an empty dir). */
const SYNTHETIC_FIXTURES = new Set(["empty"]);

/** Cache: fixture name -> { repoRoot, outDir } so re-runs hit identical bytes (determinism). */
const prepared = new Map<string, { repoRoot: string; outDir: string }>();

/**
 * Prepare a gates fixture: copy it to a temp dir, `git init` it, run the scanner to produce
 * `<repo>/.tenantguard/project-map.json` (the gates' input), and return both paths. Cached per
 * name so two gate runs over the same fixture see identical inputs (SC-005). Mirrors the 003
 * scanner fixture-prep pattern (nested-.git can't be committed → reconstruct at test time).
 */
export function gatesFixture(name: string): { repoRoot: string; outDir: string } {
  const cached = prepared.get(name);
  if (cached) return cached;

  const src = resolve(here, "fixtures", name);
  const repoRoot = join(mkdtempSync(join(tmpdir(), "tg-gates-")), name);
  if (SYNTHETIC_FIXTURES.has(name)) {
    mkdirSync(repoRoot, { recursive: true });
  } else {
    cpSync(src, repoRoot, { recursive: true });
  }
  initGitRepo(repoRoot);

  const outDir = join(repoRoot, ".tenantguard");
  scanToFile(repoRoot, outDir); // produces project-map.json the gates consume

  const entry = { repoRoot, outDir };
  prepared.set(name, entry);
  return entry;
}

function initGitRepo(dir: string): void {
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  };
  git("init", "-q");
  git("config", "user.email", "test@tenantguard.local");
  git("config", "user.name", "TenantGuard Test");
}

/** Snapshot of file path → size:mtime under a dir, excluding .git and the .tenantguard out-dir. */
export function snapshot(root: string): Map<string, string> {
  const snap = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory() && (e.name === ".git" || e.name === ".tenantguard")) continue;
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
