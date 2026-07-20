# Safe Repository Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> `superpowers:subagent-driven-development` (recommended) or
> `superpowers:executing-plans` to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic `aker-build init` and read-only `aker-build doctor`
commands to the source CLI and the verified zero-dependency npm artifact.

**Architecture:** The config package owns behavior-neutral starter serialization.
Two focused CLI command modules own orchestration: `init` performs one exclusive
config write, while `doctor` creates a pure versioned diagnostic result from
injected local probes and then renders text or JSON. Commander wiring remains a
thin adapter. Package acceptance runs the bundled executable in temporary repos.

**Tech Stack:** TypeScript 5.7, Node.js 22.13+ built-ins, Commander 12, YAML 2,
Vitest 2, pnpm 11, esbuild package bundling.

## Global Constraints

- Existing Git repository required; never invoke `git init` from product code.
- `init` writes at most one config and never overwrites a recognized config.
- `doctor` is read-only and performs no network request.
- Generated config preserves zero-config behavior.
- No credential values or config contents in diagnostics.
- No new dependency, manifest, lockfile, workflow, hosted surface, or remote write.
- External publication, tags, pushes, PRs, and workflow dispatch remain forbidden.

---

## File Structure

| File | Responsibility |
|---|---|
| `packages/config/src/index.ts` | Render schema-valid neutral YAML/JSON starter config. |
| `packages/config/tests/config.test.ts` | Prove both starter formats round-trip through `loadConfig`. |
| `packages/cli/src/commands/init.ts` | Validate target/config state and perform exclusive one-file creation. |
| `packages/cli/tests/cli.init.test.ts` | Pin init writes, idempotency, conflicts, preview, and failures. |
| `packages/cli/src/commands/doctor.ts` | Build/render diagnostic result from local probes. |
| `packages/cli/tests/cli.doctor.test.ts` | Pin order, status, modes, secret safety, rendering, and read-only behavior. |
| `packages/cli/src/index.ts` | Register/export the two commands. |
| `scripts/verify-cli-package.mjs` | Run onboarding acceptance against the packed executable. |
| `README.md`, `packages/cli/README.md`, `docs/demo/first-run.md` | Document init → doctor → check onboarding. |
| Roadmap/status/`CLAUDE.md` | Record delivered status and next boundary. |

## Task 1: Starter Config Serialization

**Files:**

- Modify: `packages/config/src/index.ts`
- Modify: `packages/config/tests/config.test.ts`

**Interfaces:**

```ts
export type ConfigFormat = "yaml" | "json";
export function renderStarterConfig(format: ConfigFormat): string;
```

- [ ] **Step 1: Write failing round-trip tests**

Add table-driven assertions that `renderStarterConfig("yaml")` and
`renderStarterConfig("json")` end with one newline, contain no active policy
beyond version 1, can be written to the matching recognized filename, and load
as `{ version: 1 }`. Assert YAML contains commented examples and an unsupported
runtime value throws `ConfigError`.

- [ ] **Step 2: Run the focused RED test**

```powershell
pnpm --filter @aker-build/config test
```

Expected: FAIL because `renderStarterConfig` is not exported.

- [ ] **Step 3: Implement the neutral renderer**

Add this boundary (with the exact examples allowed by the existing schema):

```ts
export type ConfigFormat = "yaml" | "json";

const STARTER_CONFIG: AkerBuildConfig = { version: CONFIG_VERSION };
const STARTER_YAML = [
  "# Aker Build configuration. All settings below version are optional.",
  "version: 1",
  "",
  "# paths:",
  "#   include:",
  "#     - apps/**",
  "#   exclude:",
  "#     - dist/**",
  "# specs:",
  "#   adapter: auto",
  "",
].join("\n");

export function renderStarterConfig(format: ConfigFormat): string {
  if (format === "yaml") return STARTER_YAML;
  if (format === "json") return `${JSON.stringify(STARTER_CONFIG, null, 2)}\n`;
  throw new ConfigError(`unsupported config format: ${String(format)}`);
}
```

- [ ] **Step 4: Run GREEN tests and typecheck**

```powershell
pnpm --filter @aker-build/config test
pnpm --filter @aker-build/config typecheck
```

Expected: all config tests pass; typecheck exits 0.

- [ ] **Step 5: Commit the config boundary**

Stage only the two named files and commit `feat(config): render safe starter config`.

## Task 2: Safe Init Command

**Files:**

- Create: `packages/cli/src/commands/init.ts`
- Create: `packages/cli/tests/cli.init.test.ts`
- Modify: `packages/cli/src/index.ts`

**Interfaces:**

```ts
export interface InitOptions {
  format?: "yaml" | "json";
  stdout?: boolean;
  sink?: (text: string) => void;
  errSink?: (line: string) => void;
}

export interface InitDeps {
  isGitRepository: (repoRoot: string) => boolean;
  writeExclusive: (path: string, content: string) => void;
}

export function runInit(path: string, opts?: InitOptions, deps?: InitDeps): number;
```

- [ ] **Step 1: Write failing init tests**

Cover YAML default creation, JSON creation, exact one-file mutation, stdout
preview with zero writes, valid existing config as byte-preserving success,
invalid existing config as no-write exit 2, two-format conflict as no-write exit
2, non-Git exit 1, unsupported format exit 2, and an injected `EEXIST` race that
never overwrites.

- [ ] **Step 2: Run the focused RED test**

```powershell
pnpm --filter @aker-build/cli test -- cli.init.test.ts
```

Expected: FAIL because `runInit` does not exist.

- [ ] **Step 3: Implement validation and exclusive creation**

Implement the command around these exact rules:

```ts
if (!isDirectory(repoRoot)) return fail(2, `Repository path is not a directory: ${repoRoot}`);
if (!isGitRepository(repoRoot)) return fail(1, `Not a Git repository: ${repoRoot}`);
if (stdout) {
  sink(renderStarterConfig(format));
  return 0;
}
const filename = format === "json" ? "aker-build.config.json" : "aker-build.config.yaml";
const existing = CONFIG_FILENAMES
  .map((name) => resolve(repoRoot, name))
  .filter((candidate) => existsSync(candidate));

if (existing.length > 1) return fail(2, "Multiple Aker Build config files found; keep exactly one.");
if (existing.length === 1) {
  loadConfig(repoRoot, { configPath: existing[0] });
  sink(`Aker Build already initialized: ${existing[0]}`);
  return 0;
}
writeExclusive(resolve(repoRoot, filename), renderStarterConfig(format));
```

The default Git probe uses `spawnSync("git", ["rev-parse",
"--is-inside-work-tree"], { cwd, shell: false, windowsHide: true })`. The
default writer uses `writeFileSync(path, content, { encoding: "utf8", flag:
"wx" })`. Convert config errors and `EEXIST` races to safe diagnostics without
including file contents. The default sink is raw `process.stdout.write`:
preview content owns its final newline, while human status messages add exactly
one newline before passing to the sink.

- [ ] **Step 4: Register the command**

Add `runInit` import/export and Commander wiring:

```ts
program
  .command("init")
  .description("Create a minimal Aker Build config without overwriting files")
  .argument("[path]", "target Git repository path", ".")
  .option("--format <fmt>", "yaml | json", "yaml")
  .option("--stdout", "preview config only; write no file")
  .action((path, opts) => { process.exitCode = runInit(path, opts); });
```

- [ ] **Step 5: Run GREEN tests and typecheck**

```powershell
pnpm --filter @aker-build/cli test -- cli.init.test.ts
pnpm --filter @aker-build/cli typecheck
```

Expected: init tests pass; typecheck exits 0.

- [ ] **Step 6: Commit init**

Stage only the three named files and commit `feat(cli): add safe init command`.

## Task 3: Read-Only Doctor Command

**Files:**

- Create: `packages/cli/src/commands/doctor.ts`
- Create: `packages/cli/tests/cli.doctor.test.ts`
- Modify: `packages/cli/src/index.ts`

**Interfaces:**

```ts
export type DoctorMode = "local" | "github";
export type DoctorCheckStatus = "pass" | "warn" | "fail";
export interface DoctorCheck {
  id: "node" | "git" | "repository" | "config" | "output-ignore" | "gh" | "github-token";
  status: DoctorCheckStatus;
  summary: string;
  remediation?: string;
}
export interface DoctorResult {
  version: 1;
  repository: string;
  mode: DoctorMode;
  status: "ready" | "needs_attention";
  checks: DoctorCheck[];
}
export interface CommandProbeResult { ok: boolean; stdout: string; }
export interface DoctorDeps {
  nodeVersion: string;
  probe: (command: string, args: readonly string[], cwd?: string) => CommandProbeResult;
  hasEnvironmentVariable: (name: "GH_TOKEN" | "GITHUB_TOKEN") => boolean;
}
export function diagnoseRepository(path: string, opts?: { github?: boolean }, deps?: DoctorDeps): DoctorResult;
export function renderDoctorResult(result: DoctorResult, format: "text" | "json"): string;
export function runDoctor(path: string, opts?: DoctorOptions, deps?: DoctorDeps): number;
```

- [ ] **Step 1: Write failing diagnostic tests**

Test supported/unsupported Node boundaries (`22.13.0` pass, `22.12.9` fail),
deterministic local order, warning-only readiness, non-Git failure, invalid and
dual config failure, ignored/unignored output classification, GitHub check
append order, missing/present tool and token states, no sentinel token in model
or renderers, JSON/text parity, invalid format exit 2, and a filesystem snapshot
showing zero writes.

- [ ] **Step 2: Run the focused RED test**

```powershell
pnpm --filter @aker-build/cli test -- cli.doctor.test.ts
```

Expected: FAIL because the doctor module does not exist.

- [ ] **Step 3: Implement the diagnostic model**

Use numeric version comparison and argument-array probes only. Build checks in
the contract order. Determine overall status exactly as follows:

```ts
const status = checks.some((check) => check.status === "fail")
  ? "needs_attention"
  : "ready";
return { version: 1, repository: repoRoot, mode, status, checks };
```

For token readiness, call only:

```ts
const present = deps.hasEnvironmentVariable("GH_TOKEN")
  || deps.hasEnvironmentVariable("GITHUB_TOKEN");
```

Never retrieve the value into the result or renderer. Use `git check-ignore
--quiet -- .aker-build` for output protection and report a warning with a manual
`.gitignore` remediation when it is not ignored.

- [ ] **Step 4: Implement both renderers and command exit mapping**

Text output uses ASCII status labels (`PASS`, `WARN`, `FAIL`); JSON is
`JSON.stringify(result, null, 2)` plus one newline. Return 0 for ready, 1 for
needs-attention, 2 for unsupported output format, and 3 only for an unexpected
internal exception.

- [ ] **Step 5: Register the command**

```ts
program
  .command("doctor")
  .description("Check local or GitHub PR-mode readiness without writing files")
  .argument("[path]", "target repository path", ".")
  .option("--github", "include GitHub PR-mode prerequisites")
  .option("--format <fmt>", "text | json", "text")
  .action((path, opts) => { process.exitCode = runDoctor(path, opts); });
```

- [ ] **Step 6: Run GREEN tests and typecheck**

```powershell
pnpm --filter @aker-build/cli test -- cli.doctor.test.ts
pnpm --filter @aker-build/cli test
pnpm --filter @aker-build/cli typecheck
```

Expected: all CLI tests pass; typecheck exits 0.

- [ ] **Step 7: Commit doctor**

Stage only the three named files and commit `feat(cli): add read-only doctor`.

## Task 4: Bundled Package Acceptance

**Files:**

- Modify: `scripts/verify-cli-package.mjs`

- [ ] **Step 1: Add a failing bundled onboarding smoke**

After installing the tarball, create a separate temporary Git repo. Assert:

```js
run(bin, ["init", onboardingFixture], consumer);
const initialized = readFileSync(join(onboardingFixture, "aker-build.config.yaml"), "utf8");
run(bin, ["init", onboardingFixture], consumer);
assert.equal(readFileSync(join(onboardingFixture, "aker-build.config.yaml"), "utf8"), initialized);
const preview = JSON.parse(run(bin, ["init", onboardingFixture, "--stdout", "--format", "json"], consumer));
assert.deepEqual(preview, { version: 1 });
const diagnosis = JSON.parse(run(bin, ["doctor", onboardingFixture, "--format", "json"], consumer));
assert.equal(diagnosis.status, "ready");
assert.equal(run(git, ["status", "--short"], onboardingFixture), "?? aker-build.config.yaml");
```

Use `node:assert/strict`; the fixture must not share the analysis-smoke repo.

- [ ] **Step 2: Run package acceptance**

```powershell
pnpm test:cli-package
```

Expected: the exact five-file zero-dependency tarball installs and all existing
plus onboarding smoke assertions pass.

- [ ] **Step 3: Commit package acceptance**

Stage only `scripts/verify-cli-package.mjs` and commit
`test(release): verify bundled onboarding commands`.

## Task 5: Onboarding Documentation and Product Truth

**Files:**

- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `docs/demo/first-run.md`
- Modify: `docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md`
- Modify: `docs/status/post-foundation-reconciliation.md`
- Modify: `CLAUDE.md`
- Modify: `specs/019-safe-onboarding/spec.md`
- Modify: `specs/019-safe-onboarding/tasks.md`

- [ ] **Step 1: Document the canonical onboarding sequence**

Add source and post-publish forms of:

```text
aker-build init .
aker-build doctor .
aker-build check .
```

Explain that init is the sole explicit config write, doctor is read-only, a
config is optional, and neither command modifies `.gitignore`.

- [ ] **Step 2: Reconcile active status**

Mark Spec 019 implemented, update the CLI command lists and active phase, record
019 in the roadmap/status supersession pointers, and name reusable consumer CI
packaging as the next bounded adoption-polish candidate. Keep P5/P6 deferred.

- [ ] **Step 3: Run documentation and namespace checks**

```powershell
pnpm check:namespace
git diff --check
rg -n "active feature: 018|superseded by specs 011–018|GitHub Action later|GitHub App later" README.md CLAUDE.md docs/status docs/roadmap
```

Expected: namespace passes, diff check passes, and no obsolete active pointer is
returned (historical quoted text is reviewed manually if present).

- [ ] **Step 4: Commit documentation**

Stage only the named documentation/status files and commit
`docs: document safe onboarding flow`.

## Task 6: Full Verification and Local Completion

- [ ] **Step 1: Run the full matrix**

```powershell
pnpm check:namespace
pnpm test
pnpm typecheck
pnpm test:cli-package
pnpm dlx tsx packages/eval/src/bin.ts
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
git diff --check
```

Expected: all commands exit 0; benchmark remains at or above every committed
threshold; smoke removes its temporary directory.

- [ ] **Step 2: Review exact scope and artifacts**

Confirm no manifest/lockfile/workflow/generated artifact is changed, every
changed file is in the approved list, and `git status --short` contains no
unrelated path.

- [ ] **Step 3: Complete task evidence and commit**

Record actual counts/results in `tasks.md`, stage only Spec 019 documentation,
and commit `docs: record safe onboarding verification`. Do not push.

## Plan Self-Review

- Spec coverage: FR-001–FR-015 and SC-001–SC-007 each map to Tasks 1–6.
- Placeholders: none.
- Type consistency: config format, doctor mode/status/check identifiers, result
  version, option fields, and exit codes are identical across tasks.
- Scope: no package manifest, lockfile, workflow, detector, gate, hosted, or
  remote surface is required.
