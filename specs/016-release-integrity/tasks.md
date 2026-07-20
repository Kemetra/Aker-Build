# Release Integrity Execution Tasks

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repository's tests, types, benchmark, first-run demo, naming, CI, and active documentation agree and pass from a clean checkout.

**Architecture:** Fix observed failures first, then introduce a pure Node namespace guard that scans active Git files without text/binary heuristics. Compose that invariant with existing verification in CI and finish by reconciling documentation against source/test/commit evidence.

**Tech Stack:** TypeScript, Node.js built-ins, `node:test`, pnpm, Vitest, PowerShell, GitHub Actions.

## Global Constraints

- Follow [spec.md](./spec.md) and [plan.md](./plan.md).
- No dependency or lockfile changes.
- No product judgment, schema, verdict, or GitHub permission changes.
- No production credentials or required network calls.
- Use `apply_patch` for edits.
- Do not stage or commit unless the owner explicitly authorizes it. Commit commands below are suggested boundaries only and MUST be skipped without that authorization.

---

### Task 1: Restore deterministic focused verification

**Files:**

- Modify: `packages/eval/src/run-case.ts`
- Modify: `packages/github-app-server/tests/git-workspace-real.test.ts`
- Modify: `packages/github-app-server/tests/real-review.test.ts`
- Test: `packages/eval/tests/run-case.test.ts`
- Test: `packages/github-app-server/tests/git-workspace-real.test.ts`
- Test: `packages/github-app-server/tests/real-review.test.ts`

**Interfaces:**

- Consumes: existing `scanToFile`, `runGatesToFile`, `confidenceTier`, real Git fixture helpers.
- Produces: a loadable `@aker-build/eval` pipeline and fixture commits independent of global Git signing configuration.

- [x] **Step 1: Reproduce the evaluation namespace failure**

Run:

```powershell
pnpm --filter @aker-build/eval test
pnpm --filter @aker-build/eval typecheck
```

Expected before the fix: both fail because `@tenantguard/scanner` / `@tenantguard/gates` cannot resolve.

- [x] **Step 2: Apply the minimal evaluation rename and text-hygiene fix**

In `packages/eval/src/run-case.ts`, use these exact imports and identities:

```ts
import { scanToFile } from "@aker-build/scanner";
import { runGatesToFile, confidenceTier } from "@aker-build/gates";
import type { Finding } from "@aker-build/gates";
```

```ts
const repoRoot = join(
  mkdtempSync(join(tmpdir(), "aker-build-eval-")),
  basename(c.dir) || c.name,
);
```

```ts
git("config", "user.email", "eval@aker-build.local");
git("config", "user.name", "Aker Build Eval");
```

```ts
const outDir = join(repoRoot, ".aker-build");
```

Replace the literal NUL characters in the deduplication key with an escaped separator so the file remains ordinary text:

```ts
byKey.set(`${af.gate_id}\0${af.path}\0${af.tier}`, af);
```

- [x] **Step 3: Verify the evaluation package is green**

Run:

```powershell
pnpm --filter @aker-build/eval test
pnpm --filter @aker-build/eval typecheck
```

Expected: all evaluation test files pass and type-check exits `0`.

- [x] **Step 4: Reproduce the real-Git fixture signing failure**

Run:

```powershell
pnpm --filter @aker-build/github-app-server exec vitest run tests/git-workspace-real.test.ts tests/real-review.test.ts
```

Expected before the fix on a machine with global commit signing: six tests fail at `git commit` through the configured signer. On a machine without signing, inspect the two commit calls and continue—the hermeticity defect is still present.

- [x] **Step 5: Make every affected fixture commit self-contained**

In `packages/github-app-server/tests/git-workspace-real.test.ts`:

```ts
git(repoDir, "-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "head commit");
```

In both fixture constructors in `packages/github-app-server/tests/real-review.test.ts`:

```ts
git("-c", "commit.gpgsign=false", "commit", "--quiet", "-m", "init");
```

Do not change global/local user Git configuration outside each temporary repository.

- [x] **Step 6: Verify the real-Git tests and focused package**

Run:

```powershell
pnpm --filter @aker-build/github-app-server exec vitest run tests/git-workspace-real.test.ts tests/real-review.test.ts
pnpm --filter @aker-build/github-app-server test
```

Expected: 6 focused tests pass; the full server package passes with the credential-gated live smoke reported as skipped.

- [x] **Step 7: Authorization-gated commit boundary (skipped: no commit authorization)**

Only if the owner explicitly authorizes commits:

```powershell
git add packages/eval/src/run-case.ts packages/github-app-server/tests/git-workspace-real.test.ts packages/github-app-server/tests/real-review.test.ts
git commit -m "fix: restore deterministic release verification"
```

---

### Task 2: Complete active naming and add the namespace guard

**Files:**

- Create: `scripts/check-namespace.mjs`
- Create: `scripts/check-namespace.test.mjs`
- Modify: `package.json`
- Modify: `packages/github-app-server/src/git-workspace.ts`
- Modify: `packages/github-app-server/tests/live-smoke.test.ts`
- Modify: `specs/015-github-app-deployment/live-smoke-checklist.md`
- Modify mechanical temp prefixes in the exact files listed in Step 6.

**Interfaces:**

- Produces `isActivePath(path: string): boolean`.
- Produces `findLegacyReferences(entries, allowedPaths): Array<{path,line,identifier}>`.
- Produces `readCandidateEntries(repoRoot): Array<{path,content}>`.
- Produces root commands `pnpm test:namespace` and `pnpm check:namespace`.

- [x] **Step 1: Write the namespace guard tests**

Create `scripts/check-namespace.test.mjs`:

```js
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
```

- [x] **Step 2: Run the tests to verify the module is missing**

Run:

```powershell
node --test scripts/check-namespace.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `scripts/check-namespace.mjs`.

- [x] **Step 3: Implement the pure guard and CLI**

Create `scripts/check-namespace.mjs`:

```js
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ACTIVE_ROOT_FILES = new Set([
  "README.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "package.json",
  "pnpm-workspace.yaml",
  "aker-build.config.json",
  ".specify/feature.json",
]);

const ACTIVE_PREFIXES = [
  "packages/",
  "scripts/",
  ".github/workflows/",
  "contracts/",
  "docs/status/",
  "docs/roadmap/",
  "docs/demo/",
  "specs/014-github-app-report-only/",
  "specs/015-github-app-deployment/",
  "specs/016-release-integrity/",
];

const ACTIVE_EXTENSION = /\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|ps1)$/i;
const DEFAULT_ALLOWLIST = new Set([
  "specs/016-release-integrity/spec.md",
  "specs/016-release-integrity/research.md",
  "specs/016-release-integrity/plan.md",
  "specs/016-release-integrity/tasks.md",
]);

const formerName = ["tenant", "guard"].join("");
const formerTempPrefix = ["t", "g", "-"].join("");
const formerSmokePrefix = ["T", "G", "_SMOKE_"].join("");

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function isActivePath(path) {
  const normalized = normalizePath(path);
  if (!ACTIVE_EXTENSION.test(normalized)) return false;
  return ACTIVE_ROOT_FILES.has(normalized)
    || ACTIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function findLegacyReferences(entries, allowedPaths = DEFAULT_ALLOWLIST) {
  const findings = [];
  for (const entry of entries) {
    const path = normalizePath(entry.path);
    if (!isActivePath(path) || allowedPaths.has(path)) continue;
    const lines = entry.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      if (lower.includes(formerName)) {
        findings.push({ path, line: index + 1, identifier: formerName });
      }
      if (line.includes(formerTempPrefix)) {
        findings.push({ path, line: index + 1, identifier: formerTempPrefix });
      }
      if (line.includes(formerSmokePrefix)) {
        findings.push({ path, line: index + 1, identifier: formerSmokePrefix });
      }
    });
  }
  return findings.sort((a, b) =>
    a.path.localeCompare(b.path)
      || a.line - b.line
      || a.identifier.localeCompare(b.identifier),
  );
}

export function readCandidateEntries(repoRoot) {
  const output = execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${normalizePath(repoRoot)}`,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .filter(isActivePath)
    .map((path) => ({
      path: normalizePath(path),
      content: readFileSync(resolve(repoRoot, path), "utf8"),
    }));
}

function main() {
  const entries = readCandidateEntries(process.cwd());
  const findings = findLegacyReferences(entries);
  if (findings.length === 0) {
    console.log(`Namespace integrity passed (${entries.length} active files scanned).`);
    return;
  }
  for (const finding of findings) {
    console.error(
      `${finding.path}:${finding.line}: legacy identifier ${JSON.stringify(finding.identifier)}`,
    );
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) main();
```

- [x] **Step 4: Run unit tests and observe the repository integration case fail**

Run:

```powershell
node --test scripts/check-namespace.test.mjs
```

Expected: the first three tests pass; the repository integration test fails and reports every remaining active legacy identifier.

- [x] **Step 5: Add the guard to root verification**

Update the root `package.json` scripts to:

```json
"scripts": {
  "test": "pnpm test:namespace && pnpm -r test",
  "test:namespace": "node --test scripts/check-namespace.test.mjs",
  "check:namespace": "node scripts/check-namespace.mjs",
  "typecheck": "pnpm -r typecheck"
}
```

Do not run dependency installation and do not modify `pnpm-lock.yaml`.

- [x] **Step 6: Complete the mechanical active-surface rename**

Use `apply_patch` to make these exact replacements:

- Every quoted temporary prefix `tg-...` becomes `aker-build-...` in:

```text
packages/cli/tests/cli.gates.test.ts
packages/cli/tests/cli.prompt.test.ts
packages/cli/tests/cli.queue-route.test.ts
packages/cli/tests/cli.report.test.ts
packages/cli/tests/cli.review.test.ts
packages/cli/tests/helpers.ts
packages/config/tests/config.test.ts
packages/eval/tests/corpus.test.ts
packages/gates/tests/config-composition.test.ts
packages/gates/tests/helpers.ts
packages/github-app-server/src/git-workspace.ts
packages/github-app-server/tests/git-workspace-real.test.ts
packages/github-app-server/tests/git-workspace.test.ts
packages/github-app-server/tests/node-git.test.ts
packages/github-app-server/tests/real-review.test.ts
packages/queue/tests/helpers.ts
packages/report/tests/report.test.ts
packages/review/tests/e2e-chain.test.ts
packages/review/tests/helpers.ts
packages/review/tests/pr-review.test.ts
packages/review/tests/risk-blocks.test.ts
packages/scanner/tests/auth.test.ts
packages/scanner/tests/config-surface.test.ts
packages/scanner/tests/data-access.test.ts
packages/scanner/tests/helpers.ts
packages/scanner/tests/migrations.test.ts
packages/scanner/tests/p1-integration.test.ts
packages/scanner/tests/routes.test.ts
packages/spec-kit-adapter/tests/spec-kit-adapter.test.ts
```

- Every smoke target variable `TG_SMOKE_OWNER`, `TG_SMOKE_REPO`, `TG_SMOKE_PR`, and `TG_SMOKE_HEAD_SHA` becomes `AKER_BUILD_SMOKE_OWNER`, `AKER_BUILD_SMOKE_REPO`, `AKER_BUILD_SMOKE_PR`, and `AKER_BUILD_SMOKE_HEAD_SHA` in:

```text
packages/github-app-server/tests/live-smoke.test.ts
specs/015-github-app-deployment/live-smoke-checklist.md
```

- Update the PowerShell cleanup example to remove only `Env:AKER_BUILD_*`.

Do not rename contractual gate IDs such as `TG-G4`; they are not product-brand identifiers.

- [x] **Step 7: Verify the guard and full root test entrypoint**

Run:

```powershell
pnpm test:namespace
pnpm check:namespace
pnpm test
```

Expected: namespace unit/integration tests pass, the CLI prints zero violations, and the workspace test suite passes.

- [x] **Step 8: Prove the guard fails with an exact path without altering tracked source**

Create an ignored temporary file under `packages/eval/src/` is not sufficient because ignored files are excluded. Instead, copy `scripts/check-namespace.test.mjs` to a temporary non-ignored path `scripts/namespace-negative-fixture.mjs`, insert a legacy token constructed outside the guard, run `pnpm check:namespace`, assert exit `1` and the fixture path, then remove only that exact fixture with `Remove-Item -LiteralPath scripts\namespace-negative-fixture.mjs`. Verify `git status --short` no longer lists it.

- [x] **Step 9: Authorization-gated commit boundary (skipped: no commit authorization)**

Only if explicitly authorized, stage the named files listed by `git status --short` for Task 2 and commit:

```powershell
git commit -m "test: enforce Aker Build namespace integrity"
```

Never use broad staging commands.

---

### Task 3: Make the complete release gate explicit in CI

**Files:**

- Modify: `.github/workflows/aker-build.yml`

**Interfaces:**

- Consumes: `pnpm check:namespace`, `pnpm test`, `pnpm typecheck`, existing benchmark CLI, `scripts/smoke-first-run.ps1`.
- Produces: explicit `release-integrity` and `first-run-smoke` PR jobs while preserving `review` and `benchmark`.

- [x] **Step 1: Confirm the current workflow lacks full tests/type-check/smoke**

Run:

```powershell
Select-String -Path .github\workflows\aker-build.yml -Pattern 'pnpm test|pnpm typecheck|smoke-first-run|check:namespace'
```

Expected before the change: no matches.

- [x] **Step 2: Add the Ubuntu release-integrity job**

Append this sibling job under `jobs:` without changing the existing `review` or `benchmark` behavior:

```yaml
  release-integrity:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node + pnpm
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable

      - name: Install workspace dependencies
        run: corepack pnpm install --frozen-lockfile

      - name: Check namespace integrity
        run: corepack pnpm check:namespace

      - name: Run workspace tests
        run: corepack pnpm test

      - name: Run workspace typecheck
        run: corepack pnpm typecheck
```

- [x] **Step 3: Add the Windows first-run smoke job**

Append:

```yaml
  first-run-smoke:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4

      - name: Set up Node + pnpm
        uses: actions/setup-node@v4
        with:
          node-version: 22
      - run: corepack enable

      - name: Install workspace dependencies
        run: corepack pnpm install --frozen-lockfile

      - name: Run documented first-run smoke
        shell: pwsh
        run: pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
```

- [x] **Step 4: Validate workflow structure and command coverage**

Run:

```powershell
Select-String -Path .github\workflows\aker-build.yml -Pattern '^  (review|benchmark|release-integrity|first-run-smoke):'
Select-String -Path .github\workflows\aker-build.yml -Pattern 'check:namespace|pnpm test$|pnpm typecheck|smoke-first-run.ps1 -RemoveTemp'
```

Expected: all four job names and all four release-integrity commands are present exactly once in their intended jobs; benchmark remains a separate real-pipeline gate.

- [x] **Step 5: Run local equivalents**

Run:

```powershell
pnpm check:namespace
pnpm test
pnpm typecheck
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
```

Expected: all commands exit `0`.

- [x] **Step 6: Authorization-gated commit boundary (skipped: no commit authorization)**

Only if explicitly authorized:

```powershell
git add .github/workflows/aker-build.yml
git commit -m "ci: enforce release integrity on pull requests"
```

---

### Task 4: Reconcile active product and delivery truth

**Files:**

- Modify: `.specify/feature.json`
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `CONTRIBUTING.md`
- Modify: `docs/status/post-foundation-reconciliation.md`
- Modify: `docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md`
- Modify: `packages/github-app-server/README.md`
- Modify: `specs/014-github-app-report-only/spec.md`
- Modify: `specs/014-github-app-report-only/tasks.md`
- Modify: `specs/015-github-app-deployment/spec.md`
- Modify: `specs/015-github-app-deployment/tasks.md`

**Interfaces:**

- Consumes: current source tree, focused App test evidence, commits `bacaea6`, `9f3771f`, `e6ae6aa`, `6dd1a71`, `0445ced`.
- Produces: one coherent current-phase account and one contributor-facing verification sequence.

- [x] **Step 1: Update the active feature pointers**

Set `.specify/feature.json` to:

```json
{
  "feature_directory": "specs/016-release-integrity"
}
```

In `CLAUDE.md`, change the Spec Kit active-plan pointer to:

```markdown
`specs/016-release-integrity/plan.md` (active feature: 016-release-integrity).
```

- [x] **Step 2: Correct the root README status without claiming npm availability**

Replace the status paragraphs with:

```markdown
Aker Build's MVP CLI chain and FORTIFY phases are implemented. The current focus is release integrity: reproducible tests, type-checking, benchmark evidence, first-run smoke, and documentation truth before public CLI distribution.

- Aker Build runs against its own repo through a report-only GitHub Action.
- A self-hostable, single-tenant report-only GitHub App runtime is implemented and tested locally; credentialed field verification remains an operator-run smoke step.
- The npm-published CLI, hosted dashboard/org view, blocking enforcement, auto-fix, auto-commit, and auto-merge remain deferred.
```

Keep the source-first quickstart and line stating that the npm binary is a follow-up. Add App/server and release-integrity spec links under Documentation.

- [x] **Step 3: Make CONTRIBUTING the canonical release-integrity command list**

Replace its Setup command block with:

```bash
pnpm install --frozen-lockfile
pnpm check:namespace
pnpm test
pnpm typecheck
pnpm dlx tsx packages/eval/src/bin.ts
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
```

State that the live GitHub App smoke is optional and credential-gated, with a link to `specs/015-github-app-deployment/live-smoke-checklist.md`.

- [x] **Step 4: Correct the GitHub App server README**

Add `AKER_BUILD_INSTALLATION_ID` to required environment variables. Replace the stale architecture-status paragraph with:

```markdown
## Runtime status

The HTTP listener, installation-authenticated Octokit adapter, real Git runner, ephemeral workspace, installation-token minting, composition root, and thin host entrypoint are implemented. Start the source-first development runtime with:

```bash
pnpm dlx tsx packages/github-app-server/src/bin.ts
```

The required environment is `AKER_BUILD_APP_ID`, `AKER_BUILD_APP_PRIVATE_KEY`, `AKER_BUILD_WEBHOOK_SECRET`, and `AKER_BUILD_INSTALLATION_ID`; `PORT` defaults to `3000`. The server accepts signed webhook POST requests. Packaging a container/service definition is outside 015. Credentialed verification against api.github.com remains the explicit operator smoke in `specs/015-github-app-deployment/live-smoke-checklist.md`.
```

Do not claim a health endpoint, built JavaScript distribution, public hosting, or completed credentialed smoke.

- [x] **Step 5: Reconcile 014 delivery records**

- Change `specs/014-github-app-report-only/spec.md` status to `Implemented — report-only transport; deployment runtime delivered by 015`.
- Change the tasks header status to `Implemented — commit bacaea6; documentation follow-up T027 is closed by 016`.
- Mark T001–T026 and T028–T030 complete using `[x]` based on the package source/tests and commit evidence.
- Leave T027 unchecked until the README edits in this task are applied; then mark it `[x]` and append `(completed by 016 documentation reconciliation)`.

- [x] **Step 6: Reconcile 015 delivery records**

- Change `specs/015-github-app-deployment/spec.md` status to `Implemented — self-hostable runtime; credentialed live smoke remains operator-owned`.
- Replace the obsolete delivery note with a concise statement that the core and live edge are implemented, citing the HTTP host, concrete Octokit/Git adapters, token mint, host entrypoint, local/real-component tests, and opt-in live smoke.
- Remove obsolete `[edge: port defined, adapter deferred]` labels where the adjacent requirement is implemented; preserve genuine serverless/multi-tenant/observability deferrals.
- Change the tasks header status to `Implemented — commits 9f3771f, e6ae6aa, 6dd1a71, and 0445ced; release-integrity follow-up closed by 016`.
- Mark T001–T022 and T026 complete from commit evidence.
- After current focused tests, full tests, type-checking, and docs pass, mark T023–T025 complete and append `(closed by 016)` to those three descriptions.

- [x] **Step 7: Correct roadmap and historical status pointers**

Replace the future roadmap's `The single next action` section with:

```markdown
## The single next action

FORTIFY (P1–P3), the report-only GitHub App (P4), and its self-hostable single-tenant runtime are implemented. The current prerequisite is **016 — Release Integrity**, which restores reproducible verification and source-truth documentation. After 016, **017 — One-Command Activation and Distribution** will package the existing kernel for external adoption. P5 and P6 remain deferred.
```

At the top of `docs/status/post-foundation-reconciliation.md`, change the status to `Historical snapshot — superseded by specs 011–016` and add a one-paragraph note pointing current readers to the root README, the future roadmap, and spec 016. Do not rewrite its dated evidence as though it were current.

- [x] **Step 8: Validate documentation consistency**

Run:

```powershell
pnpm check:namespace
Select-String -Path README.md,CLAUDE.md,CONTRIBUTING.md,packages\github-app-server\README.md,specs\014-github-app-report-only\spec.md,specs\015-github-app-deployment\spec.md -Pattern 'GitHub App.*deferred|production entrypoint.*remaining|\*\*Status\*\*: Draft|active feature: 015' -CaseSensitive:$false
```

Expected: namespace passes and the stale-status search returns no matches. Genuine P5/P6/public-hosting deferrals may remain when they do not match these obsolete claims.

- [x] **Step 9: Authorization-gated commit boundary (skipped: no commit authorization)**

Only if explicitly authorized, stage each Task 4 file by exact path and commit:

```powershell
git commit -m "docs: reconcile Aker Build release truth"
```

---

### Task 5: Run the release-integrity gate and audit the final scope

**Files:**

- Modify only if verification exposes a defect within the approved 016 boundaries.
- Update: `specs/016-release-integrity/tasks.md` checkboxes as each step passes.

**Interfaces:**

- Consumes every deliverable from Tasks 1–4.
- Produces the evidence required by SC-001–SC-008.

- [x] **Step 1: Confirm only approved files changed and the lockfile did not**

Run:

```powershell
git -c safe.directory=C:/Users/user/Documents/GitHub/Aker-Build status --short
git -c safe.directory=C:/Users/user/Documents/GitHub/Aker-Build diff --name-only -- pnpm-lock.yaml
```

Expected: only files named in Tasks 1–4 plus `specs/016-release-integrity/**`; no lockfile output.

- [x] **Step 2: Run namespace integrity**

Run:

```powershell
pnpm check:namespace
```

Expected: exit `0`, zero findings, ASCII pass summary.

- [x] **Step 3: Run the complete workspace tests**

Run:

```powershell
pnpm test
```

Expected: exit `0`; credential-gated live smoke may be reported skipped, never passed without credentials.

- [x] **Step 4: Run complete workspace type-checking**

Run:

```powershell
pnpm typecheck
```

Expected: exit `0` across all workspace packages.

- [x] **Step 5: Run and verify the real benchmark pipeline**

Run:

```powershell
pnpm dlx tsx packages/eval/src/bin.ts
```

Expected: all 15 committed cases execute, every committed threshold passes, and `.aker-build/benchmark-report.json` plus `.aker-build/benchmark-report.md` are regenerated as ignored artifacts.

- [x] **Step 6: Run the documented first-run path with cleanup**

Run:

```powershell
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
```

Expected: full CLI chain passes, expected artifacts are verified, and the script confirms removal of its exact temporary directory.

- [x] **Step 7: Run formatting/diff and contract-scope checks**

Run:

```powershell
git -c safe.directory=C:/Users/user/Documents/GitHub/Aker-Build diff --check
git -c safe.directory=C:/Users/user/Documents/GitHub/Aker-Build diff --name-only
git -c safe.directory=C:/Users/user/Documents/GitHub/Aker-Build status --short
```

Expected: no whitespace errors, no public schema/contract files, no dependency/lockfile changes, and no unexpected paths.

- [x] **Step 8: Update task evidence**

Mark completed checkboxes in this file only after the matching command has passed. If a command fails, keep its box open, fix only an in-scope cause, and rerun the smallest failing command before repeating the complete gate.

- [x] **Step 9: Authorization-gated final commit (skipped: no commit authorization)**

Only if the owner explicitly authorizes commits, stage every final file by exact path, inspect `git diff --cached`, then commit:

```powershell
git commit -m "chore: complete release integrity hardening"
```

Without explicit authorization, leave the verified changes uncommitted and report the exact status.

## Dependency Order

```text
Task 1 deterministic suites
  └─ Task 2 namespace guard + complete rename
       └─ Task 3 explicit CI gate
            └─ Task 4 documentation truth
                 └─ Task 5 full verification
```

## Completion Definition

Spec 016 is complete only when Task 5 passes in full, namespace validation finds zero unapproved active identifiers, active docs no longer contradict shipped P4/015 surfaces, and the diff contains no lockfile, schema, verdict, or product-capability changes.
