import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { findAmbiguousPublishArgs, isExplicitLocalPath } from "./release-publish-path.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("treats only explicitly-anchored paths as local files", () => {
  // npm resolves a bare `a/b` argument as a GitHub shorthand, so the anchor is what
  // distinguishes "this file" from "clone this repository".
  assert.equal(isExplicitLocalPath("./release/aker-build-0.1.0.tgz"), true);
  assert.equal(isExplicitLocalPath("../release/aker-build-0.1.0.tgz"), true);
  assert.equal(isExplicitLocalPath("/tmp/aker-build-0.1.0.tgz"), true);
  assert.equal(isExplicitLocalPath(".\\release\\aker-build-0.1.0.tgz"), true);
});

test("treats a bare owner/name argument as ambiguous", () => {
  // The exact form that made `npm publish` run
  // `git ls-remote ssh://git@github.com/release/aker-build-0.1.0.tgz.git`.
  assert.equal(isExplicitLocalPath("release/aker-build-0.1.0.tgz"), false);
  assert.equal(isExplicitLocalPath("release/aker-build-${RELEASE_VERSION}.tgz"), false);
});

test("finds an unanchored publish argument and ignores an anchored one", () => {
  // A hard negative alongside the positive: a guard that flagged both forms, or neither,
  // would pass its own suite while telling you nothing.
  const dir = mkdtempSync(join(tmpdir(), "aker-publish-path-"));
  try {
    const workflows = join(dir, ".github", "workflows");
    mkdirSync(workflows, { recursive: true });
    writeFileSync(
      join(workflows, "bad.yml"),
      '      - run: npm publish "release/aker-build-${RELEASE_VERSION}.tgz" --provenance\n',
    );
    writeFileSync(
      join(workflows, "good.yml"),
      '      - run: npm publish "./release/aker-build-${RELEASE_VERSION}.tgz" --provenance\n',
    );

    assert.deepEqual(findAmbiguousPublishArgs(dir), [
      {
        file: ".github/workflows/bad.yml",
        line: 1,
        argument: "release/aker-build-${RELEASE_VERSION}.tgz",
      },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no release workflow publishes from an unanchored path", () => {
  const found = findAmbiguousPublishArgs(repoRoot);
  assert.deepEqual(
    found,
    [],
    `npm would resolve these as GitHub shorthands, not files:\n  ${found
      .map((f) => `${f.file}:${f.line} -> ${f.argument}`)
      .join("\n  ")}`,
  );
});
