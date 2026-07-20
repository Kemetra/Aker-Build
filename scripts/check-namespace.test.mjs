import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  findLegacyReferences,
  isActivePath,
  readCandidateEntries,
} from "./check-namespace.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");
const formerName = ["tenant", "guard"].join("");
const formerTempPrefix = ["t", "g", "-"].join("");
const formerSmokePrefix = ["T", "G", "_SMOKE_"].join("");

test("classifies only current executable and user-facing surfaces as active", () => {
  assert.equal(isActivePath("packages/eval/src/run-case.ts"), true);
  assert.equal(isActivePath(".github/workflows/aker-build.yml"), true);
  assert.equal(isActivePath("README.md"), true);
  assert.equal(isActivePath("docs/superpowers/plans/2026-06-19-p4-checks-renderer.md"), false);
  assert.equal(isActivePath("node_modules/example/index.js"), false);
});

test("finds full names, temp prefixes, and smoke variables even in NUL-bearing text", () => {
  const entries = [{
    path: "packages/example/src/example.ts",
    content: [
      `import \"@${formerName}/scanner\";`,
      `const temp = \"${formerTempPrefix}fixture-\";\0`,
      `const target = \"${formerSmokePrefix}OWNER\";`,
    ].join("\n"),
  }];

  assert.deepEqual(findLegacyReferences(entries, new Set()), [
    { path: entries[0].path, line: 1, identifier: formerName },
    { path: entries[0].path, line: 2, identifier: formerTempPrefix },
    { path: entries[0].path, line: 3, identifier: formerSmokePrefix },
  ]);
});

test("honors exact-file allowances and does not confuse gate ids with temp prefixes", () => {
  const allowed = "specs/016-release-integrity/spec.md";
  const entries = [
    { path: allowed, content: formerName },
    { path: "packages/gates/src/index.ts", content: 'const gate = "TG-G4";' },
  ];
  assert.deepEqual(findLegacyReferences(entries, new Set([allowed])), []);
});

test("the repository has no unapproved active legacy identifiers", () => {
  const findings = findLegacyReferences(readCandidateEntries(repoRoot));
  assert.deepEqual(findings, []);
});
