import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { buildCliPackage } from "./build-cli-package.mjs";
import {
  parseVerifierArgs,
  validatePackedPaths,
  validateReleaseManifest,
  validateVersion,
} from "./cli-package.mjs";
import { readCliVersion } from "./cli-version.mjs";
import { validateReleasePreflight } from "./release-preflight.mjs";

// Derived, never restated. A literal here would pass whatever the builder emitted, which is the
// defect these tests exist to catch: the release identity rule used to compare one literal to
// another and so could not fail.
const released = readCliVersion();

const valid = {
  name: "aker-build",
  version: released,
  description: "Aker Build — CLI-first SaaS Build Kernel",
  license: "MIT",
  type: "module",
  bin: { aker: "dist/aker.js" },
  files: ["dist/aker.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"],
  engines: { node: ">=22.13" },
  repository: { type: "git", url: "git+https://github.com/Kemetra/Aker-Build.git" },
  homepage: "https://github.com/Kemetra/Aker-Build#readme",
  bugs: { url: "https://github.com/Kemetra/Aker-Build/issues" },
  keywords: ["cli", "saas", "architecture", "code-review", "static-analysis"],
  publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
};

test("accepts the exact public zero-dependency manifest", () => {
  assert.doesNotThrow(() => validateReleaseManifest(valid, released));
});

test("rejects a manifest pinned to a version other than the released one", () => {
  const manifest = { ...valid, version: "0.0.9" };
  assert.throws(
    () => validateReleaseManifest(manifest, released),
    new RegExp(`release identity must be aker-build@${released.replaceAll(".", "\\.")}`),
  );
});

test("refuses to validate a manifest without an expected version", () => {
  assert.throws(() => validateReleaseManifest(valid), /requires the expected version/);
});

for (const [name, mutate] of [
  ["workspace reference", (manifest) => { manifest.devDependencies = { "@aker-build/scanner": "workspace:*" }; }],
  ["runtime dependency", (manifest) => { manifest.dependencies = { commander: "^12.1.0" }; }],
  ["install hook", (manifest) => { manifest.scripts = { postinstall: "node install.js" }; }],
  ["wrong bin", (manifest) => { manifest.bin = { aker: "src/bin.ts" }; }],
  ["private package", (manifest) => { manifest.private = true; }],
  ["missing discovery metadata", (manifest) => { delete manifest.repository; }],
]) {
  test(`rejects ${name}`, () => {
    const manifest = structuredClone(valid);
    mutate(manifest);
    assert.throws(() => validateReleaseManifest(manifest, released));
  });
}

const packed = ["package.json", "dist/aker.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"];

test("accepts the exact packed file set", () => {
  assert.doesNotThrow(() => validatePackedPaths(packed));
});

for (const path of ["src/index.ts", "tests/cli.test.js", "fixtures/private.json"]) {
  test(`rejects packed ${path}`, () => {
    assert.throws(
      () => validatePackedPaths([...packed, path]),
      new RegExp(path.replaceAll(".", "\\.")),
    );
  });
}

test("rejects a missing required packed file", () => {
  assert.throws(
    () => validatePackedPaths(packed.filter((path) => path !== "LICENSE")),
    /packed file missing: LICENSE/,
  );
});

test("release and CLI versions must match", () => {
  assert.doesNotThrow(() => validateVersion({ packageVersion: "0.1.0", cliVersion: "0.1.0" }));
  assert.throws(
    () => validateVersion({ packageVersion: "0.1.0", cliVersion: "0.1.1" }),
    /version mismatch/,
  );
});

test("rejects an injected test path with exact evidence", () => {
  assert.throws(
    () => validatePackedPaths([...packed, "tests/forbidden.test.js"]),
    /tests\/forbidden\.test\.js/,
  );
});

test("parses and validates --tarball-dir", () => {
  assert.deepEqual(parseVerifierArgs([]), {});
  assert.deepEqual(parseVerifierArgs(["--tarball-dir", "release"]), { tarballDir: "release" });
  assert.throws(() => parseVerifierArgs(["--tarball-dir"]), /requires a path/);
  assert.throws(() => parseVerifierArgs(["--unknown"]), /unknown verifier argument/);
});

test("builds a self-contained executable package with required license notices", async () => {
  const packageDir = await buildCliPackage();
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const executablePath = join(packageDir, "dist", "aker.js");
  const executable = readFileSync(executablePath, "utf8");
  const notices = readFileSync(join(packageDir, "THIRD_PARTY_NOTICES.txt"), "utf8");

  assert.doesNotThrow(() => validateReleaseManifest(manifest, released));
  assert.match(executable, /^#!\/usr\/bin\/env node/);
  for (const file of manifest.files) assert.equal(existsSync(join(packageDir, file)), true, file);
  for (const dependency of ["commander", "yaml", "zod"]) assert.match(notices, new RegExp(`===== ${dependency} =====`));
  // The manifest the builder writes and the version the built binary reports must both come from
  // the source constant. They were independent literals, so a bump could ship a 0.1.0 manifest
  // wrapped around a 0.1.1 binary and only the packing verifier would notice.
  assert.equal(manifest.version, released);
  const version = spawnSync(process.execPath, [executablePath, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), released);
});

const release = {
  requestedVersion: "0.1.1",
  packageVersion: "0.1.1",
  gitRef: "refs/tags/v0.1.1",
  packageExists: true,
  versionExists: false,
};

test("accepts an unpublished tagged version after package bootstrap", () => {
  assert.doesNotThrow(() => validateReleasePreflight(release));
});

test("rejects a branch ref", () => {
  assert.throws(
    () => validateReleasePreflight({ ...release, gitRef: "refs/heads/main" }),
    /release ref/,
  );
});

test("rejects a manifest/input mismatch", () => {
  assert.throws(
    () => validateReleasePreflight({ ...release, packageVersion: "0.1.2" }),
    /version mismatch/,
  );
});

test("rejects a missing bootstrap package", () => {
  assert.throws(
    () => validateReleasePreflight({ ...release, packageExists: false }),
    /bootstrap/,
  );
});

test("rejects an already-published version", () => {
  assert.throws(
    () => validateReleasePreflight({ ...release, versionExists: true }),
    /already exists/,
  );
});
