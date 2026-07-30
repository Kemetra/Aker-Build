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

test("the internal package scope was not renamed", () => {
  // The scope is a package namespace users never see. Renaming it would be the broad
  // refactor CLAUDE.md forbids, so this pins the count: the rename must not leak in.
  assert.equal(countScopeRefs(repoRoot), 195);
});
