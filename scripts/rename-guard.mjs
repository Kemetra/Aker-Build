// Standing guard for the Spec 021 command rename.
//
// Two assertions in opposite directions. One proves the rename is COMPLETE (no live
// file still tells a user to run the retired command); the other proves it was not
// OVER-BROAD (the internal @aker-build/* scope is untouched). A rename checked only by
// "tests pass" can fail either way without any test noticing.

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const VERBS = [
  "check",
  "scan",
  "map",
  "gates",
  "queue",
  "route",
  "prompt",
  "report",
  "review-pr",
  "init",
];

// Matches an invocation of the retired command, e.g. "aker-build scan" or
// `aker-build route --stdout`. Deliberately NOT the bare string: `.aker-build/`,
// `aker-build-report.json`, and `@aker-build/queue` are not commands and must survive.
// The negative lookbehind excludes the npm scope, whose slash form would otherwise
// never match anyway, and the leading \b keeps `my-aker-build` from matching.
const RETIRED = new RegExp(String.raw`(?<![@\w-])aker-build\s+(?:${VERBS.join("|")})\b`);

const SCOPE = /@aker-build\/[a-z-]+/g;

// The command's own declared identity, e.g. Commander's `.name("aker-build")`. The
// invocation pattern above cannot catch this: it requires a verb after the name, and the
// help banner reads `Usage: aker-build [options]`.
//
// Deliberately keyed to the `.name(...)` call rather than the bare string, because the
// published npm *package* is still legitimately called `aker-build` -- only the command
// was renamed. Flagging `"name": "aker-build"` in a manifest would demand a wrong change.
const PROGRAM_NAME = /\.name\(\s*["']aker-build["']\s*\)/;

const PROGRAM_EXTENSIONS = [".ts", ".mjs", ".js"];

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".aker-build"]);
const SCANNED_EXTENSIONS = [".md", ".ts", ".mjs", ".json", ".yml", ".yaml", ".ps1", ".sh"];

/**
 * Files that must contain the retired name to do their job.
 *
 * A detector whose own source matches its pattern reports itself, and the tempting fix
 * is to loosen the pattern -- which silently weakens the check everywhere. An explicit,
 * named allowlist keeps the pattern strict and makes each exemption reviewable.
 *
 * - This file defines the pattern it searches for.
 * - Its test builds a fixture containing the retired name to prove the pattern fires.
 * - The guidance test asserts the retired string is ABSENT, so it must name it.
 *
 * Each entry is a file whose *purpose* is to reference the retired name. Nothing else
 * belongs here: adding a file to silence a genuine miss would defeat the guard.
 */
const SELF_REFERENTIAL = new Set([
  "scripts/rename-guard.mjs",
  "scripts/rename-guard.test.mjs",
  "packages/queue/tests/error-guidance.test.ts",
]);

// Directories holding point-in-time records: specs as written, decisions as made, runs as
// observed. A spec that documented the old command was true when written, and rewriting it
// would damage the audit trail this project depends on.
const HISTORICAL_PREFIXES = [
  "specs/",
  "docs/decisions/",
  "docs/roadmap/",
  "docs/superpowers/",
  "docs/evidence/",
  "docs/status/",
  "docs/release/",
  "docs/demo/",
  ".specify/",
];

const HISTORICAL_FILES = new Set(["docs/aker_build_project_blueprint.md"]);

/** True for records the rename deliberately leaves naming the retired command. */
export function isHistoricalPath(relativePath) {
  const p = toPosix(relativePath);
  return HISTORICAL_PREFIXES.some((prefix) => p.startsWith(prefix)) || HISTORICAL_FILES.has(p);
}

function toPosix(path) {
  return path.split(sep).join("/");
}

/**
 * True for a directory that is its own checkout: a linked worktree (`.git` file), a
 * clone, or a submodule (`.git` directory).
 *
 * Such a directory's files belong to a different commit -- frequently an older one that
 * still invokes the retired command, because that is what the rename retired. Reporting
 * them describes history, not this tree. Git draws this boundary itself; this guard walks
 * the filesystem, so it must draw the boundary explicitly.
 *
 * Keyed on the checkout marker rather than a directory name on purpose: worktrees are not
 * required to live anywhere in particular, and a name-based skip would have to guess. It
 * would also overshoot -- `SKIP_DIRS` matches basenames, so skipping `claude` would
 * silence `distribution/bundle-templates/claude/`, whose templates are live content.
 */
function isNestedCheckout(dir) {
  return existsSync(join(dir, ".git"));
}

function walk(root, dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const directory = statSync(full).isDirectory();
    // Each condition stays at one level: nesting the checkout test inside the directory
    // branch reads as a second decision about the same entry, which it is not.
    // The repository root is never tested -- walk() only reaches child directories, and
    // the root's own `.git` is already in SKIP_DIRS.
    if (directory && isNestedCheckout(full)) continue;
    if (directory) {
      walk(root, full, out);
      continue;
    }
    if (!SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
    out.push(full);
  }
  return out;
}

/** True for files that must name the retired command to serve their purpose. */
export function isSelfReferential(relativePath) {
  return SELF_REFERENTIAL.has(toPosix(relativePath));
}

/** Lines within one file that invoke the retired command. */
function retiredRefsInFile(fullPath, relativePath) {
  const lines = readFileSync(fullPath, "utf8").split("\n");
  return lines
    .map((line, index) => (RETIRED.test(line) ? { file: toPosix(relativePath), line: index + 1 } : null))
    .filter((hit) => hit !== null);
}

/** Every live (non-historical, non-self-referential) line that still invokes the retired command. */
export function findLiveCommandRefs(root) {
  const hits = [];
  for (const full of walk(root, root, [])) {
    const rel = relative(root, full);
    if (isHistoricalPath(rel) || isSelfReferential(rel)) continue;
    hits.push(...retiredRefsInFile(full, rel));
  }
  return hits;
}

/** Every live line declaring the retired name as the command's own identity. */
export function findRetiredProgramNames(root) {
  const hits = [];
  for (const full of walk(root, root, [])) {
    const rel = relative(root, full);
    if (isHistoricalPath(rel) || isSelfReferential(rel)) continue;
    if (!PROGRAM_EXTENSIONS.some((ext) => full.endsWith(ext))) continue;
    readFileSync(full, "utf8")
      .split("\n")
      .forEach((line, index) => {
        if (PROGRAM_NAME.test(line)) hits.push({ file: toPosix(rel), line: index + 1 });
      });
  }
  return hits;
}

/** Count of internal package-scope references, which the rename must not change. */
export function countScopeRefs(root) {
  let count = 0;
  for (const full of walk(root, root, [])) {
    const rel = relative(root, full);
    if (!rel.startsWith("packages") && !rel.startsWith("scripts")) continue;
    if (!full.endsWith(".ts") && !full.endsWith(".json")) continue;
    count += (readFileSync(full, "utf8").match(SCOPE) ?? []).length;
  }
  return count;
}
