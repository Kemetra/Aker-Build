// Standing guard for the Spec 021 command rename.
//
// Two assertions in opposite directions. One proves the rename is COMPLETE (no live
// file still tells a user to run the retired command); the other proves it was not
// OVER-BROAD (the internal @aker-build/* scope is untouched). A rename checked only by
// "tests pass" can fail either way without any test noticing.

import { readFileSync, readdirSync, statSync } from "node:fs";
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

/**
 * Historical records are point-in-time evidence, not living documentation. A spec that
 * documented the old command was true when written; rewriting it would damage the audit
 * trail this project depends on, so the guard exempts these paths by design.
 */
export function isHistoricalPath(relativePath) {
  const p = relativePath.split(sep).join("/");
  return (
    p.startsWith("specs/") ||
    p.startsWith("docs/decisions/") ||
    p.startsWith("docs/roadmap/") ||
    p.startsWith("docs/superpowers/") ||
    p.startsWith("docs/evidence/") ||
    p.startsWith("docs/status/") ||
    p.startsWith("docs/release/") ||
    p.startsWith("docs/demo/") ||
    p.startsWith(".specify/") ||
    p === "docs/aker_build_project_blueprint.md"
  );
}

function walk(root, dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
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
  return SELF_REFERENTIAL.has(relativePath.split(sep).join("/"));
}

/** Every live (non-historical, non-self-referential) line that still invokes the retired command. */
export function findLiveCommandRefs(root) {
  const hits = [];
  for (const full of walk(root, root, [])) {
    const rel = relative(root, full);
    if (isHistoricalPath(rel) || isSelfReferential(rel)) continue;
    const lines = readFileSync(full, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (RETIRED.test(line)) hits.push({ file: rel.split(sep).join("/"), line: index + 1 });
    }
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
