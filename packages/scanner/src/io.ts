import { readdirSync, readFileSync, statSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "coverage",
  ".tenantguard",
]);

/** Read-only: list repo-relative file paths under `root`, skipping noise dirs. Stable (sorted). */
export function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return; // unreadable dir — caller records a note (FR-009)
    }
    // sort for determinism (R3)
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      if (e.isDirectory()) {
        if (SKIP_DIRS.has(e.name)) continue;
        walk(join(dir, e.name));
      } else if (e.isFile()) {
        out.push(relative(root, join(dir, e.name)).split(sep).join("/"));
      }
    }
  };
  walk(root);
  return out;
}

/** Read-only: does a repo-relative path exist as a file? */
export function fileExists(root: string, relPath: string): boolean {
  try {
    return statSync(join(root, relPath)).isFile();
  } catch {
    return false;
  }
}

/** Read-only: read a repo-relative file; null if unreadable (caller records a note). */
export function readFileSafe(root: string, relPath: string): string | null {
  try {
    return readFileSync(join(root, relPath), "utf8");
  } catch {
    return null;
  }
}

/** Is `root` a Git repository (has a .git dir/file)? */
export function isGitRepo(root: string): boolean {
  return existsSync(join(root, ".git"));
}

/**
 * Write output to a designated dir OUTSIDE the scanned repo's tracked source (FR-003).
 * Creating/writing under outDir is not a modification of the scanned repo's tracked files.
 */
export function writeOutput(outDir: string, fileName: string, content: string): string {
  mkdirSync(outDir, { recursive: true });
  const target = join(outDir, fileName);
  writeFileSync(target, content, "utf8");
  return target;
}
