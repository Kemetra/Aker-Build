# One-Command Activation and Distribution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a clean-installable `aker-build@0.1.0` tarball whose canonical `aker-build check .` command runs the existing advisory chain, plus CI and an operator-gated OIDC release path.

**Architecture:** A new CLI command composes existing command functions into a temporary artifact generation and promotes files only after all stages succeed. An esbuild script bundles the CLI graph into one ESM executable and generates a sanitized, zero-dependency npm package directory; a built-in Node verifier packs and installs that exact artifact on Linux and Windows. Ordinary CI verifies, while a separate manual workflow can publish only after external bootstrap and approval.

**Tech Stack:** TypeScript 5.7, Node.js 22.14+, pnpm 11, Commander 12, esbuild 0.21.5, Vitest 2, Node built-in test runner, npm 11.5.1+, GitHub Actions OIDC.

## Global Constraints

- Integrate verified Spec 016 before any 017 production edit; 017 MUST NOT recreate or bypass 016 changes.
- Canonical activation is `npx aker-build check .`; the first real npm publish is operator-owned and outside automated acceptance.
- `check` is scan → gates → queue → route → report only; no prompt, review, agent execution, mutation, enforcement, or network use.
- Existing commands, schemas, contract versions, finding logic, verdicts, and GitHub App behavior remain compatible.
- Publish one `aker-build@0.1.0` package with an `aker-build` bin, zero production dependencies, and no lifecycle install hooks.
- Support Node.js `>=22.13`; OIDC publication uses Node `22.14` or newer and npm `11.5.1` or newer.
- Package acceptance must pass on GitHub-hosted Ubuntu and Windows.
- Do not commit, push, publish, create a release, configure npm/GitHub, or mutate any external system without explicit owner authorization.

## Integration Preflight

Before Task 1, verify the branch contains Spec 016's namespace guard and green release gate:

```powershell
Test-Path scripts/check-namespace.mjs
pnpm check:namespace
pnpm test
pnpm typecheck
```

Expected: the file exists and all three commands exit `0`. If it does not, stop: integrate 016 first. Do not copy its uncommitted work into this branch.

## File Structure

| Path | Responsibility |
|---|---|
| `packages/cli/src/commands/check.ts` | Compose existing commands, isolate staging output, promote complete artifacts, map failures. |
| `packages/cli/tests/cli.check.test.ts` | Prove order, option propagation, failure short-circuit, cleanup, promotion, and source read-only behavior. |
| `packages/cli/src/index.ts` | Register/export `check`; read CLI version from a generated constant. |
| `packages/cli/src/version.ts` | Single source-readable CLI version constant (`0.1.0`) used by source and bundle. |
| `scripts/build-cli-package.mjs` | Bundle code and generate the sanitized npm directory under `packages/cli/dist/npm/`. |
| `scripts/cli-package.mjs` | Pure package-manifest and tarball-file validation helpers. |
| `scripts/cli-package.test.mjs` | Node tests for package validation and release preflight rules. |
| `scripts/verify-cli-package.mjs` | Build, pack, inspect, clean-install, and smoke the exact tarball. |
| `scripts/release-preflight.mjs` | Fail closed on ref/version/name/bootstrap mismatches before `npm publish`. |
| Generated `THIRD_PARTY_NOTICES.txt` | Full installed license texts for bundled Commander, YAML, and Zod. |
| `.github/workflows/aker-build.yml` | Add non-publishing package acceptance to PR CI after 016 gates. |
| `.github/workflows/npm-release.yml` | Manual, environment-protected OIDC publish job for post-bootstrap releases. |
| `docs/release/npm.md` | First-publish bootstrap, trusted-publisher configuration, and subsequent release checklist. |
| Root/package docs and Spec Kit pointers | Make the source-first, tarball-ready, and public-published states unambiguous. |

---


### Task 1: Add the atomic `check` orchestration command

**Files:**

- Create: `packages/cli/src/commands/check.ts`
- Create: `packages/cli/tests/cli.check.test.ts`
- Create: `packages/cli/src/version.ts`
- Modify: `packages/cli/src/index.ts`

**Interfaces:**

- Consumes: `runScan`, `runGatesCommand`, `runQueueCommand`, `runRouteCommand`, `runReportCommand`.
- Produces: `runCheck(targetPath: string, opts?: CheckCmdOptions, deps?: CheckDeps): 0 | 1 | 2 | 3` and exported `CLI_VERSION = "0.1.0"`.

- [ ] **Step 1: Write failing orchestration tests**

Create `packages/cli/tests/cli.check.test.ts` with real filesystem isolation and injected stage functions:

```ts
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CHECK_ARTIFACTS, runCheck, type CheckDeps } from "../src/commands/check.js";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })));

function root(): string {
  const value = mkdtempSync(join(tmpdir(), "aker-build-check-test-"));
  roots.push(value);
  return value;
}

function deps(order: string[], fail?: string, stageOut?: string[]): CheckDeps {
  const stage = (name: string, files: string[]) => (_target: string, opts: { out?: string; errSink?: (line: string) => void }) => {
    order.push(name);
    stageOut?.push(opts.out ?? "");
    mkdirSync(opts.out ?? "", { recursive: true });
    files.forEach((file) => writeFileSync(join(opts.out ?? "", file), JSON.stringify({ stage: name })));
    if (fail === name) opts.errSink?.(`${name} diagnostic`);
    return fail === name ? 3 : 0;
  };
  return {
    scan: stage("scan", ["project-map.json"]),
    gates: stage("gates", ["risks.json"]),
    queue: stage("queue", ["queue.json"]),
    route: stage("route", ["route.json"]),
    report: stage("report", ["aker-build-report.json", "aker-build-report.md"]),
  } as CheckDeps;
}

describe("runCheck", () => {
  it("runs every stage in order, shares one staging directory, and promotes the complete set", () => {
    const work = root();
    const out = join(work, "out");
    const order: string[] = [];
    const stageOut: string[] = [];
    expect(runCheck(work, { out, config: "aker-build.config.json", sink: () => {}, errSink: () => {} }, deps(order, undefined, stageOut))).toBe(0);
    expect(order).toEqual(["scan", "gates", "queue", "route", "report"]);
    expect(new Set(stageOut).size).toBe(1);
    CHECK_ARTIFACTS.forEach((file) => expect(existsSync(join(out, file))).toBe(true));
    expect(existsSync(stageOut[0]!)).toBe(false);
  });

  it("short-circuits, preserves the prior complete set, and removes staging on failure", () => {
    const work = root();
    const out = join(work, "out");
    mkdirSync(out);
    writeFileSync(join(out, "project-map.json"), "previous");
    const order: string[] = [];
    const stageOut: string[] = [];
    const errors: string[] = [];
    expect(runCheck(work, { out, sink: () => {}, errSink: (line) => errors.push(line) }, deps(order, "gates", stageOut))).toBe(3);
    expect(order).toEqual(["scan", "gates"]);
    expect(readFileSync(join(out, "project-map.json"), "utf8")).toBe("previous");
    expect(existsSync(stageOut[0]!)).toBe(false);
    expect(errors.at(-1)).toContain("gates diagnostic");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run:

```powershell
pnpm --filter @aker-build/cli exec vitest run tests/cli.check.test.ts
```

Expected: FAIL because `../src/commands/check.js` does not exist.

- [ ] **Step 3: Implement staging, short-circuiting, promotion, and cleanup**

Create `packages/cli/src/commands/check.ts`:

```ts
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runScan, type ScanCmdOptions } from "./scan.js";
import { runGatesCommand, type GatesCmdOptions } from "./gates.js";
import { runQueueCommand, type QueueCmdOptions } from "./queue.js";
import { runRouteCommand, type RouteCmdOptions } from "./route.js";
import { runReportCommand, type ReportCmdOptions } from "./report.js";

export const CHECK_ARTIFACTS = [
  "project-map.json", "risks.json", "queue.json", "route.json",
  "aker-build-report.json", "aker-build-report.md",
] as const;
export type CheckExitCode = 0 | 1 | 2 | 3;
export interface CheckCmdOptions { out?: string; config?: string; sink?: (line: string) => void; errSink?: (line: string) => void }
export interface CheckDeps {
  scan: (target: string, opts: ScanCmdOptions) => number;
  gates: (target: string, opts: GatesCmdOptions) => number;
  queue: (target: string, opts: QueueCmdOptions) => number;
  route: (target: string, opts: RouteCmdOptions) => number;
  report: (target: string, opts: ReportCmdOptions) => number;
}
const DEFAULT_DEPS: CheckDeps = { scan: runScan, gates: runGatesCommand, queue: runQueueCommand, route: runRouteCommand, report: runReportCommand };

function promote(staged: string, output: string): void {
  mkdirSync(output, { recursive: true });
  for (const file of CHECK_ARTIFACTS) {
    const source = join(staged, file);
    if (!existsSync(source)) throw new Error(`check stage output missing: ${file}`);
    const destination = join(output, file);
    const next = join(dirname(destination), `.${basename(destination)}.next`);
    copyFileSync(source, next);
    renameSync(next, destination);
  }
}

export function runCheck(targetPath: string, opts: CheckCmdOptions = {}, deps: CheckDeps = DEFAULT_DEPS): CheckExitCode {
  const output = resolve(opts.out ?? ".aker-build");
  const print = opts.sink ?? ((line: string) => process.stdout.write(`${line}\n`));
  const printErr = opts.errSink ?? ((line: string) => process.stderr.write(`${line}\n`));
  const root = mkdtempSync(join(tmpdir(), "aker-build-check-"));
  const staged = join(root, "out");
  const diagnostics: string[] = [];
  const quiet = { sink: (_line: string) => {}, errSink: (line: string) => diagnostics.push(line) };
  const stages = [
    ["scan", () => deps.scan(targetPath, { out: staged, config: opts.config, ...quiet })],
    ["gates", () => deps.gates(targetPath, { out: staged, config: opts.config, ...quiet })],
    ["queue", () => deps.queue(targetPath, { out: staged, ...quiet })],
    ["route", () => deps.route(targetPath, { out: staged, ...quiet })],
    ["report", () => deps.report(targetPath, { out: staged, ...quiet })],
  ] as const;
  try {
    for (const [name, run] of stages) {
      diagnostics.length = 0;
      printErr(`check: ${name}`);
      const code = run();
      if (code !== 0) {
        const detail = diagnostics.at(-1);
        printErr(`check failed at ${name} (exit ${code})${detail ? `: ${detail}` : ""}`);
        return (code >= 1 && code <= 3 ? code : 3) as CheckExitCode;
      }
    }
    promote(staged, output);
    print(`Aker Build check complete: ${output}`);
    return 0;
  } catch (error) {
    printErr(error instanceof Error ? error.message : String(error));
    return 3;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}
```

- [ ] **Step 4: Register the command and version**

Create `packages/cli/src/version.ts`:

```ts
export const CLI_VERSION = "0.1.0";
```

In `packages/cli/src/index.ts`, import/export `runCheck` and `CLI_VERSION`, change `.version("0.0.0")` to `.version(CLI_VERSION)`, and add before `scan`:

```ts
program
  .command("check")
  .description("Run scan, gates, queue, route, and report in one read-only pass")
  .argument("[path]", "target repo path", ".")
  .option("--config <path>", "explicit aker-build.config.json/yaml path")
  .option("--out <dir>", "output directory for the complete artifact set", ".aker-build")
  .action((path: string, opts: { config?: string; out: string }) => {
    process.exitCode = runCheck(path, opts);
  });
```

- [ ] **Step 5: Run focused and package tests**

```powershell
pnpm --filter @aker-build/cli exec vitest run tests/cli.check.test.ts
pnpm --filter @aker-build/cli test
pnpm --filter @aker-build/cli typecheck
```

Expected: all exit `0`; tests cover option propagation, diagnostic preservation, stage failure codes 1/2/3, six promoted files, and staging cleanup.

- [ ] **Step 6: Authorization-gated commit boundary**

If explicitly authorized, stage only the four Task 1 files and commit `feat(cli): add one-command check flow`. Otherwise leave them uncommitted.

---

### Task 2: Build a sanitized zero-dependency npm package

**Files:**

- Create: `scripts/build-cli-package.mjs`
- Create: `scripts/cli-package.mjs`
- Create: `scripts/cli-package.test.mjs`
- Modify: `package.json`
- Modify: `packages/cli/package.json`
- Modify: `.gitignore`
- Modify: `pnpm-lock.yaml` (only the direct esbuild declaration and manifest metadata resolution)

**Interfaces:**

- Consumes: `packages/cli/src/bin.ts`, `packages/cli/src/version.ts`, the root `LICENSE`, and installed Commander/YAML/Zod licenses.
- Produces: `buildCliPackage(): Promise<string>` returning `packages/cli/dist/npm`, plus `validateReleaseManifest()` and `validatePackedPaths()` helpers.

- [ ] **Step 1: Write manifest-validation tests first**

Create `scripts/cli-package.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validateReleaseManifest } from "./cli-package.mjs";

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
  ["workspace reference", (m) => { m.devDependencies = { "@aker-build/scanner": "workspace:*" }; }],
  ["runtime dependency", (m) => { m.dependencies = { commander: "^12.1.0" }; }],
  ["install hook", (m) => { m.scripts = { postinstall: "node install.js" }; }],
  ["wrong bin", (m) => { m.bin = { "aker-build": "src/bin.ts" }; }],
]) {
  test(`rejects ${name}`, () => {
    const manifest = structuredClone(valid);
    mutate(manifest);
    assert.throws(() => validateReleaseManifest(manifest));
  });
}
```

- [ ] **Step 2: Run the validator tests and confirm RED**

```powershell
node --test scripts/cli-package.test.mjs
```

Expected: FAIL because `scripts/cli-package.mjs` does not exist.

- [ ] **Step 3: Implement the pure manifest validator**

Create `scripts/cli-package.mjs`:

```js
const REQUIRED_FILES = ["dist/aker-build.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"];

export function validateReleaseManifest(manifest) {
  const json = JSON.stringify(manifest);
  if (manifest.name !== "aker-build" || manifest.version !== "0.1.0") throw new Error("release identity must be aker-build@0.1.0");
  if (manifest.bin?.["aker-build"] !== "dist/aker-build.js") throw new Error("aker-build bin must target dist/aker-build.js");
  if (manifest.engines?.node !== ">=22.13") throw new Error("Node engine must be >=22.13");
  if (manifest.private === true) throw new Error("generated release manifest cannot be private");
  if (manifest.dependencies && Object.keys(manifest.dependencies).length > 0) throw new Error("release package must have zero dependencies");
  if (json.includes("workspace:")) throw new Error("release package cannot contain workspace protocol references");
  const hooks = manifest.scripts ?? {};
  for (const name of ["preinstall", "install", "postinstall"]) if (hooks[name]) throw new Error(`release package cannot define ${name}`);
  if (JSON.stringify(manifest.files) !== JSON.stringify(REQUIRED_FILES)) throw new Error("release files allowlist mismatch");
  if (manifest.license !== "MIT" || manifest.publishConfig?.access !== "public") throw new Error("release license/publish metadata mismatch");
  if (!manifest.repository?.url || !manifest.homepage || !manifest.bugs?.url || !Array.isArray(manifest.keywords)) throw new Error("release discovery metadata missing");
}

export function validatePackedPaths(paths) {
  const allowed = new Set(["package.json", ...REQUIRED_FILES]);
  const unexpected = paths.filter((path) => !allowed.has(path.replace(/^package\//, "")));
  if (unexpected.length > 0) throw new Error(`unexpected packed files: ${unexpected.join(", ")}`);
  for (const required of allowed) if (!paths.some((path) => path.replace(/^package\//, "") === required)) throw new Error(`packed file missing: ${required}`);
}
```

Extend the same test file before running GREEN:

```js
const packed = ["package.json", "dist/aker-build.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"];
test("accepts the exact packed file set", () => assert.doesNotThrow(() => validatePackedPaths(packed)));
for (const path of ["src/index.ts", "tests/cli.test.js", "fixtures/private.json"]) {
  test(`rejects packed ${path}`, () => assert.throws(() => validatePackedPaths([...packed, path]), new RegExp(path.replaceAll(".", "\\."))));
}
```

- [ ] **Step 4: Add a direct pinned esbuild build dependency and package metadata**

In root `package.json`, add:

```json
"scripts": {
  "build:cli-package": "node scripts/build-cli-package.mjs",
  "test:cli-package": "node --test scripts/cli-package.test.mjs && node scripts/verify-cli-package.mjs"
},
"devDependencies": {
  "esbuild": "0.21.5"
}
```

Merge those keys with Spec 016's existing scripts; do not replace `test`, `test:namespace`, `check:namespace`, or `typecheck`.

In `packages/cli/package.json`, set version `0.1.0`, add `"private": true`, and add repository/homepage/bugs/keywords metadata. Keep workspace dependencies for monorepo development; they are never copied to the generated manifest.

Run:

```powershell
pnpm install --lockfile-only
pnpm install --frozen-lockfile
```

Expected: only `package.json`, `packages/cli/package.json`, and `pnpm-lock.yaml` reflect dependency/metadata changes; `.gitignore` contains only the release-artifact exclusion.

Add `/release/` to `.gitignore` so an operator's verified tarball directory cannot be staged accidentally.

- [ ] **Step 5: Implement the bundle/package generator**

Create `scripts/build-cli-package.mjs`:

```js
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { validateReleaseManifest } from "./cli-package.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(repo, "packages", "cli", "dist", "npm");
function dependencyRoot(name, fromManifest) {
  const localRequire = createRequire(join(repo, fromManifest));
  let current = dirname(localRequire.resolve(name));
  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`package root not found: ${name}`);
    current = parent;
  }
  return current;
}

function licenseText(name, fromManifest) {
  const root = dependencyRoot(name, fromManifest);
  const license = readdirSync(root).find((file) => /^licen[cs]e/i.test(file) && statSync(join(root, file)).isFile());
  if (!license) throw new Error(`license file not found: ${name}`);
  return `===== ${name} =====\n${readFileSync(join(root, license), "utf8").trim()}\n`;
}

export async function buildCliPackage() {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(join(output, "dist"), { recursive: true });
  await build({
    entryPoints: [join(repo, "packages", "cli", "src", "bin.ts")],
    outfile: join(output, "dist", "aker-build.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    legalComments: "none",
    sourcemap: false,
  });
  const executable = readFileSync(join(output, "dist", "aker-build.js"), "utf8");
  if (!executable.startsWith("#!/usr/bin/env node")) throw new Error("built CLI is missing its node shebang");
  chmodSync(join(output, "dist", "aker-build.js"), 0o755);
  const manifest = {
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
  validateReleaseManifest(manifest);
  writeFileSync(join(output, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  copyFileSync(join(repo, "packages", "cli", "README.md"), join(output, "README.md"));
  copyFileSync(join(repo, "LICENSE"), join(output, "LICENSE"));
  const licenses = [
    licenseText("commander", "packages/cli/package.json"),
    licenseText("yaml", "packages/cli/package.json"),
    licenseText("zod", "packages/project-map/package.json"),
  ];
  writeFileSync(join(output, "THIRD_PARTY_NOTICES.txt"), ["Bundled third-party licenses", ...licenses].join("\n\n"));
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCliPackage().then((path) => process.stdout.write(`${path}\n`)).catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
```

The pinned esbuild build must preserve the source entrypoint's single shebang; the explicit post-build assertion fails closed if it does not.

- [ ] **Step 6: Run build and validation tests**

```powershell
node --test scripts/cli-package.test.mjs
pnpm build:cli-package
node packages/cli/dist/npm/dist/aker-build.js --version
node packages/cli/dist/npm/dist/aker-build.js --help
```

Expected: tests pass; both CLI commands exit `0`; version is exactly `0.1.0`; the generated directory is ignored by Git.

- [ ] **Step 7: Authorization-gated commit boundary**

If explicitly authorized, stage only Task 2 source/manifests/lockfile and commit `build(cli): create zero-dependency npm artifact`. Never stage `packages/cli/dist/`.

---


### Task 3: Verify the exact tarball in a clean cross-platform install

**Files:**

- Modify: `scripts/cli-package.mjs`
- Modify: `scripts/cli-package.test.mjs`
- Create: `scripts/verify-cli-package.mjs`

**Interfaces:**

- Consumes: `buildCliPackage()`, `validateReleaseManifest()`, `validatePackedPaths()`, and `examples/multi-tenant-saas-basic/`.
- Produces: `pnpm test:cli-package`, which prints the tarball path, packed file count, installed version, and smoke result and exits non-zero on any mismatch.

- [ ] **Step 1: Complete packed-file and version-consistency tests**

Add tests that reject `src/index.ts`, `tests/`, `fixtures/`, absent notices, and any manifest version differing from `CLI_VERSION`. Export a `validateVersion({ packageVersion, cliVersion })` helper with exact equality.

```js
test("release and CLI versions must match", () => {
  assert.doesNotThrow(() => validateVersion({ packageVersion: "0.1.0", cliVersion: "0.1.0" }));
  assert.throws(() => validateVersion({ packageVersion: "0.1.0", cliVersion: "0.1.1" }), /version mismatch/);
});
```

- [ ] **Step 2: Run the focused tests and confirm RED, then implement helpers**

```powershell
node --test scripts/cli-package.test.mjs
```

Expected RED: `validateVersion` is not exported. Implement it as an exact comparison, add packed-path cases, and rerun to PASS.

- [ ] **Step 3: Implement exact tarball packing, inspection, installation, and smoke**

Create `scripts/verify-cli-package.mjs` with these concrete operations:

```js
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildCliPackage } from "./build-cli-package.mjs";
import { validatePackedPaths, validateReleaseManifest, validateVersion } from "./cli-package.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const git = process.platform === "win32" ? "git.exe" : "git";
const work = mkdtempSync(join(tmpdir(), "aker-build-package-smoke-"));
function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", shell: process.platform === "win32", env: { ...process.env, npm_config_audit: "false", npm_config_fund: "false" } });
  if (result.status !== 0) throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

try {
  const packageDir = await buildCliPackage();
  const cliSource = readFileSync(join(repo, "packages", "cli", "src", "version.ts"), "utf8").match(/"([^"]+)"/)?.[1];
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  validateReleaseManifest(manifest);
  validateVersion({ packageVersion: manifest.version, cliVersion: cliSource });
  const packJson = JSON.parse(run(npm, ["pack", "--json", "--pack-destination", work, packageDir], repo));
  const packed = packJson[0];
  validatePackedPaths(packed.files.map((file) => file.path));
  const tarball = join(work, packed.filename);
  const consumer = join(work, "consumer");
  const fixture = join(work, "fixture");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), "{\"private\":true}\n");
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);
  cpSync(join(repo, "examples", "multi-tenant-saas-basic"), fixture, { recursive: true });
  run(git, ["init"], fixture);
  run(git, ["-c", "user.email=smoke@aker-build.local", "-c", "user.name=Aker Build Smoke", "-c", "commit.gpgsign=false", "add", "."], fixture);
  run(git, ["-c", "user.email=smoke@aker-build.local", "-c", "user.name=Aker Build Smoke", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"], fixture);
  const bin = join(consumer, "node_modules", ".bin", process.platform === "win32" ? "aker-build.cmd" : "aker-build");
  run(bin, ["--help"], consumer);
  const output = join(work, "output");
  run(bin, ["check", fixture, "--out", output], consumer);
  for (const file of ["project-map.json", "risks.json", "queue.json", "route.json", "aker-build-report.json", "aker-build-report.md"]) {
    if (!existsSync(join(output, file))) throw new Error(`smoke artifact missing: ${file}`);
  }
  process.stdout.write(`Packed CLI smoke passed: ${packed.filename} (${packed.entryCount} files)\n`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
```

- [ ] **Step 4: Prove the tarball guard rejects an injected path**

Add this pure negative test without changing generated or tracked package content:

```js
test("rejects an injected test path with exact evidence", () => {
  const validPaths = ["package.json", "dist/aker-build.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"];
  assert.throws(
    () => validatePackedPaths([...validPaths, "tests/forbidden.test.js"]),
    /tests\/forbidden\.test\.js/,
  );
});
```

- [ ] **Step 5: Run the complete local package acceptance**

```powershell
pnpm test:cli-package
git status --short
```

Expected: Node tests pass, tarball install/smoke passes, temp directory is removed, and `packages/cli/dist/` is absent from status.

- [ ] **Step 6: Authorization-gated commit boundary**

If explicitly authorized, stage only the three Task 3 scripts and commit `test(cli): verify packed activation path`.

---


### Task 4: Add non-publishing CI and a fail-closed OIDC release workflow

**Files:**

- Create: `scripts/release-preflight.mjs`
- Modify: `scripts/cli-package.test.mjs`
- Modify: `scripts/verify-cli-package.mjs`
- Modify: `.github/workflows/aker-build.yml`
- Create: `.github/workflows/npm-release.yml`

**Interfaces:**

- Consumes: Spec 016 release-integrity commands and the exact tarball produced by Task 3.
- Produces: `validateReleasePreflight(input)` plus a manual `npm-release` workflow that publishes the already-smoked `.tgz` only after environment approval.

- [ ] **Step 1: Write release-preflight tests before implementation**

Append to `scripts/cli-package.test.mjs`:

```js
import { validateReleasePreflight } from "./release-preflight.mjs";

const release = { requestedVersion: "0.1.1", packageVersion: "0.1.1", gitRef: "refs/tags/v0.1.1", packageExists: true, versionExists: false };
test("accepts an unpublished tagged version after package bootstrap", () => assert.doesNotThrow(() => validateReleasePreflight(release)));
test("rejects a branch ref", () => assert.throws(() => validateReleasePreflight({ ...release, gitRef: "refs/heads/main" }), /release ref/));
test("rejects a manifest/input mismatch", () => assert.throws(() => validateReleasePreflight({ ...release, packageVersion: "0.1.2" }), /version mismatch/));
test("rejects a missing bootstrap package", () => assert.throws(() => validateReleasePreflight({ ...release, packageExists: false }), /bootstrap/));
test("rejects an already-published version", () => assert.throws(() => validateReleasePreflight({ ...release, versionExists: true }), /already exists/));
```

- [ ] **Step 2: Run the tests and confirm RED**

```powershell
node --test scripts/cli-package.test.mjs
```

Expected: FAIL because `scripts/release-preflight.mjs` does not exist.

- [ ] **Step 3: Implement pure and live release preflight**

Create `scripts/release-preflight.mjs`:

```js
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validateReleasePreflight(input) {
  if (input.requestedVersion !== input.packageVersion) throw new Error("release version mismatch");
  if (input.gitRef !== `refs/tags/v${input.requestedVersion}`) throw new Error("release ref must be refs/tags/v<version>");
  if (!input.packageExists) throw new Error("npm package bootstrap is required before trusted publishing");
  if (input.versionExists) throw new Error(`aker-build@${input.requestedVersion} already exists`);
}

function npmView(spec) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  return spawnSync(npm, ["view", spec, "version", "--json"], { encoding: "utf8" }).status === 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const requestedVersion = process.argv[2];
    if (!requestedVersion) throw new Error("usage: node scripts/release-preflight.mjs <version>");
    const manifest = JSON.parse(readFileSync(resolve("packages/cli/dist/npm/package.json"), "utf8"));
    validateReleasePreflight({ requestedVersion, packageVersion: manifest.version, gitRef: process.env.GITHUB_REF ?? "", packageExists: true, versionExists: false });
    validateReleasePreflight({
      requestedVersion,
      packageVersion: manifest.version,
      gitRef: process.env.GITHUB_REF ?? "",
      packageExists: npmView("aker-build"),
      versionExists: npmView(`aker-build@${requestedVersion}`),
    });
    process.stdout.write(`Release preflight passed for aker-build@${requestedVersion}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
```

The live path performs only registry reads. Tests call the pure function and never contact npm.

- [ ] **Step 4: Make the package verifier preserve the exact tested tarball when requested**

First add this helper and test to `scripts/cli-package.mjs` and `scripts/cli-package.test.mjs`:

```js
export function parseVerifierArgs(args) {
  const index = args.indexOf("--tarball-dir");
  if (index < 0) return {};
  const value = args[index + 1];
  if (!value || value.startsWith("--")) throw new Error("--tarball-dir requires a path");
  return { tarballDir: value };
}

test("parses and validates --tarball-dir", () => {
  assert.deepEqual(parseVerifierArgs([]), {});
  assert.deepEqual(parseVerifierArgs(["--tarball-dir", "release"]), { tarballDir: "release" });
  assert.throws(() => parseVerifierArgs(["--tarball-dir"]), /requires a path/);
});
```

Then add the optional argument to `scripts/verify-cli-package.mjs`. After all assertions pass, create the requested directory and copy the verified tarball there before cleaning the temporary workspace:

```js
const { tarballDir: tarballArg } = parseVerifierArgs(process.argv.slice(2));
const tarballDir = tarballArg ? resolve(tarballArg) : undefined;
// after the installed smoke passes:
if (tarballDir) {
  mkdirSync(tarballDir, { recursive: true });
  copyFileSync(tarball, join(tarballDir, packed.filename));
}
```

Import `copyFileSync` and `parseVerifierArgs` in the verifier.

- [ ] **Step 5: Add package acceptance to ordinary CI**

After integrating Spec 016's workflow, add this job to `.github/workflows/aker-build.yml`:

```yaml
  package-acceptance:
    name: Package acceptance (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "22.14"
          cache: "pnpm"
      - run: corepack enable
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:cli-package
```

Confirm this workflow contains no `npm publish`, `npm stage publish`, `NODE_AUTH_TOKEN`, or `id-token: write`.

- [ ] **Step 6: Add the manual protected publishing workflow**

Create `.github/workflows/npm-release.yml`:

```yaml
name: npm release

on:
  workflow_dispatch:
    inputs:
      version:
        description: Exact package version; dispatch this workflow from refs/tags/v<version>
        required: true
        type: string

permissions:
  contents: read

jobs:
  publish:
    name: Verify and publish aker-build
    runs-on: ubuntu-latest
    environment: npm-release
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-node@v6
        with:
          node-version: "22.14"
          registry-url: "https://registry.npmjs.org/"
          package-manager-cache: false
      - run: corepack enable
      - run: npm install --global npm@11.5.1
      - run: pnpm install --frozen-lockfile
      - run: pnpm check:namespace
      - run: pnpm test
      - run: pnpm typecheck
      - run: pnpm dlx tsx packages/eval/src/bin.ts
      - run: pnpm build:cli-package
      - run: node scripts/release-preflight.mjs "${{ inputs.version }}"
      - run: node scripts/verify-cli-package.mjs --tarball-dir release
      - run: npm publish "release/aker-build-${{ inputs.version }}.tgz"
```

Do not add `NODE_AUTH_TOKEN`. The `npm-release` GitHub environment must be documented as requiring reviewers; workflow YAML names the environment but cannot configure its protection.

- [ ] **Step 7: Validate workflow structure without publishing**

Run:

```powershell
node --test scripts/cli-package.test.mjs
Select-String -Path .github/workflows/aker-build.yml -Pattern 'package-acceptance','ubuntu-latest','windows-latest','pnpm test:cli-package'
Select-String -Path .github/workflows/npm-release.yml -Pattern 'workflow_dispatch','environment: npm-release','id-token: write','release-preflight','npm publish'
$forbidden = Select-String -Path .github/workflows/aker-build.yml,.github/workflows/npm-release.yml -Pattern 'NODE_AUTH_TOKEN|NPM_TOKEN'; if ($forbidden) { $forbidden; exit 1 }
```

Expected: all required lines found, no forbidden token references, and no command invokes the release workflow locally.

- [ ] **Step 8: Authorization-gated commit boundary**

If explicitly authorized, stage only Task 4 scripts/workflows and commit `ci: verify and gate npm releases`. Do not dispatch the workflow.

---


### Task 5: Document activation state and operator-owned bootstrap

**Files:**

- Create: `docs/release/npm.md`
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/decisions/ADR-010-cli-distribution-release-model.md`
- Modify: `.specify/feature.json`
- Modify: `CLAUDE.md`
- Update: `specs/017-one-command-distribution/spec.md`
- Update: `specs/017-one-command-distribution/tasks.md`

**Interfaces:**

- Consumes: exact commands and external boundaries proven by Tasks 1–4.
- Produces: one coherent distinction among source development, verified tarball readiness, and actual public npm availability.

- [ ] **Step 1: Write the npm bootstrap and subsequent-release checklist**

Create `docs/release/npm.md` with these explicit sections and commands:

```markdown
# npm Release Runbook

## Current state
The repository builds and verifies `aker-build@0.1.0`; public availability begins only after the owner completes the first-publish checklist.

## First publish (operator-owned)
1. Recheck `https://registry.npmjs.org/aker-build` and confirm the intended npm account has 2FA.
2. From the release tag, run the full release-integrity gate and `node scripts/verify-cli-package.mjs --tarball-dir release`.
3. Inspect `npm pack --json` evidence and publish `release/aker-build-0.1.0.tgz` interactively with 2FA.
4. Configure npm Trusted Publisher for repository `Kemetra/Aker-Build`, workflow `npm-release.yml`, environment `npm-release`, allowed action `npm publish`.
5. Configure required reviewers on the GitHub `npm-release` environment and disallow long-lived publish tokens.

## Subsequent releases
1. Commit the version change through a reviewed spec and green CI.
2. Create protected tag `v<version>` at the reviewed commit.
3. Dispatch `npm release` from that exact tag with the same version.
4. Approve the `npm-release` environment only after preflight/package evidence is green.
5. Verify the npm provenance record and run `npx aker-build@<version> --version`.

## Rollback
npm versions are immutable. Deprecate a bad version with an explanatory message, fix forward with a new patch version, and never reuse or force-republish a version.
```

Do not include credentials, secret names, token commands, or a claim that `aker-build` is already public.

- [ ] **Step 2: Update current user and contributor paths**

- README status: say the verified npm artifact/release workflow is implemented while first publication remains operator-owned.
- README quickstart: show `npx aker-build check .` only under an explicit “after public release” label; retain the verified source/tarball path until registry publication is confirmed.
- CLI README: document `check`, its six artifact files, exit codes, and the packed executable; remove the claim that only TypeScript-source execution exists.
- CONTRIBUTING: add `pnpm build:cli-package` and `pnpm test:cli-package` to the release-integrity command list.
- ADR-010: set `Status: Accepted`, replace the proposed spec link with 017, record the single-bundle and first-publish bootstrap decisions.
- `.specify/feature.json` and `CLAUDE.md`: point at `specs/017-one-command-distribution/plan.md` only after 016 is integrated.

- [ ] **Step 3: Add documentation consistency assertions**

Run:

```powershell
$stale = Select-String -Path README.md,packages\cli\README.md,CONTRIBUTING.md,CLAUDE.md,docs\decisions\ADR-010-cli-distribution-release-model.md -Pattern 'only TypeScript-source|npm-published.*follow-up|active feature: 016|Status: Proposed'; if ($stale) { $stale; exit 1 }
$claims = Select-String -Path README.md,packages\cli\README.md,docs\release\npm.md -Pattern 'already published|available now on npm'; if ($claims) { $claims; exit 1 }
```

Expected: no stale or premature-publication matches.

- [ ] **Step 4: Authorization-gated commit boundary**

If explicitly authorized, stage only Task 5 docs/pointers and commit `docs: define npm activation and release runbook`.

---


### Task 6: Full release and contract-scope verification

**Files:**

- Modify only if a failing command exposes an in-scope 017 defect.
- Update: `specs/017-one-command-distribution/tasks.md` after matching evidence passes.

**Interfaces:**

- Consumes every deliverable from Tasks 1–5.
- Produces the evidence for SC-001–SC-011 without a registry write.

- [ ] **Step 1: Audit paths, dependency changes, and generated output**

```powershell
git status --short
git diff --name-only
git diff -- pnpm-lock.yaml
git status --short --ignored packages/cli/dist
```

Expected: only approved 016/017 paths, one pinned esbuild lockfile change, and ignored generated package output.

- [ ] **Step 2: Run source and namespace verification**

```powershell
pnpm check:namespace
pnpm test
pnpm typecheck
```

Expected: all exit `0`; credential-gated live GitHub smoke remains explicitly skipped without credentials.

- [ ] **Step 3: Run benchmark and existing first-run smoke**

```powershell
pnpm dlx tsx packages/eval/src/bin.ts
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
```

Expected: all 15 benchmark cases meet thresholds and the exact temporary first-run directory is removed.

- [ ] **Step 4: Run built package acceptance**

```powershell
pnpm test:cli-package
```

Expected: manifest/unit checks pass, exact tarball contents pass, clean install passes, packed `--help` and `check` pass, and temp files are removed.

- [ ] **Step 5: Prove ordinary CI cannot publish and release preflight fails closed locally**

```powershell
$ordinary = Select-String -Path .github/workflows/aker-build.yml -Pattern 'npm publish|npm stage publish|id-token: write|NODE_AUTH_TOKEN|NPM_TOKEN'; if ($ordinary) { $ordinary; exit 1 }
$env:GITHUB_REF='refs/heads/main'; node scripts/release-preflight.mjs 0.1.0; if ($LASTEXITCODE -eq 0) { throw 'branch preflight unexpectedly passed' }; Remove-Item Env:GITHUB_REF
```

Expected: no ordinary-CI publication surface; local branch preflight exits non-zero before any registry write.

- [ ] **Step 6: Run final whitespace and public-contract audit**

```powershell
git diff --check
$contracts = git diff --name-only | Select-String -Pattern 'contracts/|schema|packages/project-map/src|packages/gates/src|packages/review/src'; if ($contracts) { $contracts; exit 1 }
git status --short
```

Expected: no whitespace errors, public contract/domain implementation paths, generated package output, or unexpected files.

- [ ] **Step 7: Record evidence and status honestly**

Mark 017 implemented as “release-ready; first npm publish operator-owned.” Do not call it publicly available until `npm view aker-build@0.1.0` succeeds after an authorized owner release.

- [ ] **Step 8: Authorization-gated final commit**

Only with explicit authorization, stage every final file by exact path, inspect `git diff --cached`, and commit `feat: add one-command npm distribution path`. Never publish, push, tag, or dispatch as part of this step.


## Requirement Coverage

| Spec requirements | Plan task |
|---|---|
| FR-001–FR-008, SC-001/SC-004/SC-005 | Task 1 |
| FR-009–FR-015, FR-020, SC-003/SC-011 | Tasks 2–3 |
| FR-014–FR-019, SC-002/SC-007–SC-010 | Tasks 3–4 |
| Source truth and operator boundary | Task 5 |
| FR-021, SC-006 and complete regression proof | Task 6 |

## Execution Order

```text
016 integration preflight
  -> Task 1 check command
  -> Task 2 bundle/manifest
  -> Task 3 exact tarball acceptance
  -> Task 4 CI + manual OIDC workflow
  -> Task 5 documentation
  -> Task 6 full verification
```
