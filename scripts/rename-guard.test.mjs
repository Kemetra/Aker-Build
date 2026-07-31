import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  countScopeRefs,
  findLiveCommandRefs,
  findRetiredProgramNames,
  isHistoricalPath,
  isSelfReferential,
} from "./rename-guard.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("classifies historical records so they are exempt from the rename", () => {
  assert.equal(isHistoricalPath("specs/003-cli-scanner/spec.md"), true);
  assert.equal(isHistoricalPath("docs/decisions/ADR-002-cli-framework.md"), true);
  assert.equal(isHistoricalPath("docs/superpowers/plans/2026-07-30-agent-surface.md"), true);
  assert.equal(isHistoricalPath("README.md"), false);
  assert.equal(isHistoricalPath("packages/queue/src/context.ts"), false);
  assert.equal(isHistoricalPath("distribution/bundle-templates/claude/commands/check.md"), false);
});

test("no live file invokes the retired command name", () => {
  const refs = findLiveCommandRefs(repoRoot);
  assert.deepEqual(
    refs,
    [],
    `retired command still invoked in live files:\n  ${refs.map((r) => `${r.file}:${r.line}`).join("\n  ")}`,
  );
});

test("exempts only the files whose purpose is to name the retired command", () => {
  assert.equal(isSelfReferential("scripts/rename-guard.mjs"), true);
  assert.equal(isSelfReferential("scripts/rename-guard.test.mjs"), true);
  assert.equal(isSelfReferential("packages/queue/tests/error-guidance.test.ts"), true);
  assert.equal(isSelfReferential("README.md"), false);
  assert.equal(isSelfReferential("packages/queue/src/context.ts"), false);
  assert.equal(isSelfReferential("distribution/bundle-templates/claude/commands/check.md"), false);
});

test("still catches a retired invocation in an ordinary file", () => {
  // The allowlist above is a risk: an over-broad exemption would make this guard pass
  // while real misses remain. This proves the pattern still fires on a normal file, and
  // that the near-miss strings which must survive -- the output directory, the report
  // artifact, and the npm scope -- do not trip it.
  const dir = mkdtempSync(join(tmpdir(), "aker-rename-guard-"));
  try {
    writeFileSync(join(dir, "README.md"), "Run `aker-build scan .` to begin.\n");
    mkdirSync(join(dir, "packages"), { recursive: true });
    writeFileSync(
      join(dir, "packages", "keep.ts"),
      [
        'import { x } from "@aker-build/queue";',
        'const out = ".aker-build/queue.json";',
        'const report = "aker-build-report.json";',
        "",
      ].join("\n"),
    );

    const hits = findLiveCommandRefs(dir);
    assert.deepEqual(
      hits,
      [{ file: "README.md", line: 1 }],
      `expected exactly the README hit, got ${JSON.stringify(hits)}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("skips a nested checkout, whose files belong to another commit", () => {
  // A linked worktree carries a `.git` FILE; a nested clone carries a `.git` DIRECTORY.
  // Either way the contents are some other commit's, often an older one that still
  // invokes the retired command -- which the rename retired, so finding it there is a
  // statement about history rather than about this tree.
  const dir = mkdtempSync(join(tmpdir(), "aker-rename-guard-nested-"));
  try {
    writeFileSync(join(dir, "README.md"), "Run `aker check .` to begin.\n");

    const linked = join(dir, ".claude", "worktrees", "old-branch");
    mkdirSync(linked, { recursive: true });
    writeFileSync(join(linked, ".git"), "gitdir: /elsewhere/.git/worktrees/old-branch\n");
    writeFileSync(join(linked, "README.md"), "Run `aker-build scan .` to begin.\n");

    const clone = join(dir, "vendor", "checkout");
    mkdirSync(join(clone, ".git"), { recursive: true });
    writeFileSync(join(clone, "README.md"), "Run `aker-build route .` to begin.\n");

    assert.deepEqual(
      findLiveCommandRefs(dir),
      [],
      "a separate checkout's files must not be reported as this tree's",
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("still scans an ordinary directory named claude", () => {
  // The near-miss that makes a name-based skip unsafe: `SKIP_DIRS` matches basenames, so
  // skipping "claude" would silence distribution/bundle-templates/claude/ -- the live
  // agent command templates the other tests assert are NOT exempt.
  const dir = mkdtempSync(join(tmpdir(), "aker-rename-guard-claude-"));
  try {
    const templates = join(dir, "distribution", "bundle-templates", "claude");
    mkdirSync(templates, { recursive: true });
    writeFileSync(join(templates, "check.md"), "Run `aker-build check .` to begin.\n");

    assert.deepEqual(findLiveCommandRefs(dir), [
      { file: "distribution/bundle-templates/claude/check.md", line: 1 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scans a directory holding .gitignore but no .git", () => {
  // The checkout test matches an exact entry name, not a prefix: `.gitignore`,
  // `.github/`, and `.gitattributes` are ordinary tracked content.
  const dir = mkdtempSync(join(tmpdir(), "aker-rename-guard-gitish-"));
  try {
    const sub = join(dir, "packages", "thing");
    mkdirSync(sub, { recursive: true });
    writeFileSync(join(sub, ".gitignore"), "node_modules\n");
    writeFileSync(join(sub, ".gitattributes"), "* text=auto\n");
    writeFileSync(join(sub, "README.md"), "Run `aker-build gates .` to begin.\n");

    assert.deepEqual(findLiveCommandRefs(dir), [
      { file: "packages/thing/README.md", line: 1 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no live file declares the retired name as the command's own identity", () => {
  // The invocation pattern needs a verb after the name, so it cannot see
  // `.name("aker-build")` -- yet that is what Commander prints in `aker --help`
  // ("Usage: aker-build"), which is the rename being visibly incomplete to every user.
  const refs = findRetiredProgramNames(repoRoot);
  assert.deepEqual(
    refs,
    [],
    `the CLI still identifies itself by the retired name:\n  ${refs
      .map((r) => `${r.file}:${r.line}`)
      .join("\n  ")}`,
  );
});

test("distinguishes the command's identity from the package's name", () => {
  // The published npm package IS called aker-build; only the *command* was renamed. A
  // detector that flagged the package name would demand an incorrect change, so these
  // near-misses are the ones that matter.
  const dir = mkdtempSync(join(tmpdir(), "aker-rename-guard-progname-"));
  try {
    mkdirSync(join(dir, "packages"), { recursive: true });
    writeFileSync(join(dir, "package.json"), '{ "name": "aker-build", "bin": { "aker": "x.js" } }\n');
    writeFileSync(
      join(dir, "packages", "keep.ts"),
      [
        'program.name("aker");',
        'import { x } from "@aker-build/queue";',
        'const out = ".aker-build/queue.json";',
        'const report = "aker-build-report.json";',
        "",
      ].join("\n"),
    );
    assert.deepEqual(findRetiredProgramNames(dir), []);

    writeFileSync(join(dir, "packages", "bad.ts"), 'program\n  .name("aker-build")\n');
    assert.deepEqual(findRetiredProgramNames(dir), [{ file: "packages/bad.ts", line: 2 }]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the internal package scope was not renamed", () => {
  // The scope is a package namespace users never see. Renaming it would be the broad
  // refactor CLAUDE.md forbids, so this pins the count: the rename must not leak in.
  assert.equal(countScopeRefs(repoRoot), 195);
});
