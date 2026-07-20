import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { join } from "node:path";
import { buildCliPackage } from "./build-cli-package.mjs";
import { validatePackedPaths, validateReleaseManifest, validateVersion } from "./cli-package.mjs";

const valid = {
  name: "aker-build",
  version: "0.1.0",
  description: "Aker Build — CLI-first SaaS Build Kernel",
  license: "MIT",
  type: "module",
  bin: { "aker-build": "dist/aker-build.js" },
  files: ["dist/aker-build.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"],
  engines: { node: ">=22.13" },
  repository: { type: "git", url: "git+https://github.com/Kemetra/Aker-Build.git" },
  homepage: "https://github.com/Kemetra/Aker-Build#readme",
  bugs: { url: "https://github.com/Kemetra/Aker-Build/issues" },
  keywords: ["cli", "saas", "architecture", "code-review", "static-analysis"],
  publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
};

test("accepts the exact public zero-dependency manifest", () => {
  assert.doesNotThrow(() => validateReleaseManifest(valid));
});

for (const [name, mutate] of [
  ["workspace reference", (manifest) => { manifest.devDependencies = { "@aker-build/scanner": "workspace:*" }; }],
  ["runtime dependency", (manifest) => { manifest.dependencies = { commander: "^12.1.0" }; }],
  ["install hook", (manifest) => { manifest.scripts = { postinstall: "node install.js" }; }],
  ["wrong bin", (manifest) => { manifest.bin = { "aker-build": "src/bin.ts" }; }],
  ["private package", (manifest) => { manifest.private = true; }],
  ["missing discovery metadata", (manifest) => { delete manifest.repository; }],
]) {
  test(`rejects ${name}`, () => {
    const manifest = structuredClone(valid);
    mutate(manifest);
    assert.throws(() => validateReleaseManifest(manifest));
  });
}

const packed = ["package.json", "dist/aker-build.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"];

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

test("builds a self-contained executable package with required license notices", async () => {
  const packageDir = await buildCliPackage();
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  const executablePath = join(packageDir, "dist", "aker-build.js");
  const executable = readFileSync(executablePath, "utf8");
  const notices = readFileSync(join(packageDir, "THIRD_PARTY_NOTICES.txt"), "utf8");

  assert.doesNotThrow(() => validateReleaseManifest(manifest));
  assert.match(executable, /^#!\/usr\/bin\/env node/);
  for (const file of manifest.files) assert.equal(existsSync(join(packageDir, file)), true, file);
  for (const dependency of ["commander", "yaml", "zod"]) assert.match(notices, new RegExp(`===== ${dependency} =====`));
  const version = spawnSync(process.execPath, [executablePath, "--version"], { encoding: "utf8" });
  assert.equal(version.status, 0, version.stderr);
  assert.equal(version.stdout.trim(), "0.1.0");
});
