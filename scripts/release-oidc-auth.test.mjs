import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { findOidcAuthConflicts } from "./release-oidc-auth.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function workflowFixture(files) {
  const dir = mkdtempSync(join(tmpdir(), "aker-oidc-auth-"));
  const workflows = join(dir, ".github", "workflows");
  mkdirSync(workflows, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(join(workflows, name), body);
  }
  return dir;
}

const OIDC_PUBLISH_WITH_REGISTRY_URL = `name: npm release
permissions:
  id-token: write
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: "https://registry.npmjs.org/"
      - run: npm publish "./release/pkg-1.0.0.tgz" --provenance
`;

test("flags a registry auth token in an OIDC npm publish workflow", () => {
  const dir = workflowFixture({ "npm-release.yml": OIDC_PUBLISH_WITH_REGISTRY_URL });
  try {
    assert.deepEqual(findOidcAuthConflicts(dir), [
      { file: ".github/workflows/npm-release.yml", line: 9 },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("accepts an OIDC publish workflow with no registry-url", () => {
  const dir = workflowFixture({
    "npm-release.yml": OIDC_PUBLISH_WITH_REGISTRY_URL.replace(
      /\s+registry-url: .*\n/,
      "\n          node-version: \"22.14\"\n",
    ),
  });
  try {
    assert.deepEqual(findOidcAuthConflicts(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("leaves a token-authenticated publish alone", () => {
  // registry-url is what makes token publishing work. Without `id-token: write` there is no
  // OIDC identity to displace, so flagging it would demand a change that breaks the workflow.
  const dir = workflowFixture({
    "legacy.yml": `name: legacy
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: "https://registry.npmjs.org/"
      - run: npm publish "./pkg.tgz"
        env:
          NODE_AUTH_TOKEN: \${{ secrets.NPM_TOKEN }}
`,
  });
  try {
    assert.deepEqual(findOidcAuthConflicts(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("leaves a non-npm OIDC workflow alone", () => {
  // The PyPI release workflow sets id-token: write and uses setup-node to build the bundle it
  // vendors. It never runs `npm publish`, so an npm registry setting cannot affect its auth.
  const dir = workflowFixture({
    "pypi-release.yml": `name: PyPI Release
permissions:
  id-token: write
jobs:
  publish:
    steps:
      - uses: actions/setup-node@v6
        with:
          registry-url: "https://registry.npmjs.org/"
      - uses: pypa/gh-action-pypi-publish@release/v1
`,
  });
  try {
    assert.deepEqual(findOidcAuthConflicts(dir), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("no release workflow disables OIDC by configuring a registry token", () => {
  const conflicts = findOidcAuthConflicts(repoRoot);
  assert.deepEqual(
    conflicts,
    [],
    `registry-url displaces OIDC auth in:\n  ${conflicts
      .map((c) => `${c.file}:${c.line}`)
      .join("\n  ")}`,
  );
});
