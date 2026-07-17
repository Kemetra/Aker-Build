# 016 Source Truth and CI Baseline Implementation Plan

> Execute this plan in order. Tests/contracts precede the changes they protect. Do not commit,
> push, or change repository settings unless the owner separately requests those actions.

**Status**: Implemented and externally reviewed locally on 2026-07-17; hosted handoff pending
**Goal**: Make repository claims, Git fixtures, CI, and supply-chain checks accurate and enforceable.
**Architecture**: Repository-contract tests guard documentation and workflow invariants; existing
package tests retain ownership of product behavior; GitHub workflows provide hosted platform and
security evidence.
**Tech stack**: TypeScript, Vitest, pnpm 11, Node 22.13/24, PowerShell, GitHub Actions, CodeQL.
**Dependency changes**: None. `pnpm-lock.yaml` is forbidden.

## Source Evidence

- `package.json` declares Node `>=22.13`, pnpm `11.0.8`, `pnpm test`, and `pnpm typecheck`.
- `.github/workflows/aker-build.yml` currently runs dogfood review and benchmark only.
- The local audit produced 388 passing automated tests with three gated live-smoke tests skipped.
- The unmodified suite failed six tests when global Git commit signing was inherited; it passed
  after signing was disabled process-locally.
- `packages/github-app-server/src/bin.ts`, `http-server.ts`, `octokit-api.ts`, and `node-git.ts`
  prove that the host and concrete adapters exist.
- `packages/github-app-server/tests/live-smoke.test.ts` still uses legacy `TG_SMOKE_*` names.
- GitHub's secure-use guidance recommends full-length Action SHAs.
- Pin review date: 2026-07-17.

## Reviewed Action Pins

Use these exact references in every workflow. The release comment is required so Dependabot and
humans retain version context.

```yaml
- uses: actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0 # v7.0.0
- uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
- uses: github/codeql-action/init@7188fc363630916deb702c7fdcf4e481b751f97a # v4.37.1
- uses: github/codeql-action/analyze@7188fc363630916deb702c7fdcf4e481b751f97a # v4.37.1
```

## Scope

### Allowed files

```text
.github/CODEOWNERS
.github/dependabot.yml
.github/workflows/aker-build.yml
.github/workflows/security.yml
SECURITY.md
README.md
CLAUDE.md
docs/operations/repository-protection.md
docs/superpowers/specs/2026-07-17-production-trust-and-expansion-program-design.md
packages/eval/tests/repository-baseline.test.ts
packages/eval/fixtures/hostile-gitconfig
packages/cli/tests/cli.review.test.ts
packages/review/tests/helpers.ts
packages/review/tests/e2e-chain.test.ts
packages/github-app/README.md
packages/github-app-server/README.md
packages/cli/README.md
packages/github-app-server/tests/git-workspace-real.test.ts
packages/github-app-server/tests/real-review.test.ts
packages/github-app-server/tests/live-smoke.test.ts
specs/014-github-app-report-only/spec.md
specs/014-github-app-report-only/plan.md
specs/014-github-app-report-only/tasks.md
specs/014-github-app-report-only/quickstart.md
specs/014-github-app-report-only/implementation-evidence.md
specs/015-github-app-deployment/spec.md
specs/015-github-app-deployment/plan.md
specs/015-github-app-deployment/tasks.md
specs/015-github-app-deployment/quickstart.md
specs/015-github-app-deployment/live-smoke-checklist.md
specs/015-github-app-deployment/acceptance-evidence.md
specs/016-source-truth-ci-baseline/**
```

### Forbidden files and behavior

```text
pnpm-lock.yaml and all package manifests
packages/**/src/** production code
detectors, gates, review verdicts, schemas, and output contracts
runtime queue/timeout/resource-limit behavior
npm publishing, distributable Action packaging, MCP, dashboard, or org aggregation
auto-fix, commit, push, label, merge, enforcement, or agent execution
real credentials, private keys, tokens, .env files, or generated .aker-build output
```

Stop if an implementation gap in 014/015 requires production code. Record it as incomplete evidence
and route it to the appropriate later feature instead of silently expanding 016.

## Task 1: Add Failing Repository-Baseline Contract Tests

**Files**:

- Create: `packages/eval/tests/repository-baseline.test.ts`
- Read: `.github/workflows/*.yml`, `.github/dependabot.yml`, scoped App docs and ledgers

### Step 1.1 — Write the action-pin and CI matrix contracts

Use `readFileSync`, `resolve`, and regular expressions only; do not add a YAML dependency. Resolve
the repository root using the same pattern as `packages/eval/tests/ci-gate.test.ts`.

```ts
const ACTION_REF = /uses:\s*([^\s@]+)@([^\s#]+)/g;
const FULL_SHA = /^[0-9a-f]{40}$/;

function actionRefs(yaml: string): Array<{ action: string; ref: string }> {
  return [...yaml.matchAll(ACTION_REF)].map((match) => ({
    action: match[1] ?? "",
    ref: match[2] ?? "",
  }));
}

it("pins every GitHub Action to a full commit SHA", () => {
  const refs = WORKFLOW_FILES.flatMap((path) => actionRefs(read(path)));
  expect(refs.length).toBeGreaterThan(0);
  expect(refs.every(({ ref }) => FULL_SHA.test(ref))).toBe(true);
});

it("runs the quality baseline on the supported engines and platforms", () => {
  const workflow = read(".github/workflows/aker-build.yml");
  for (const value of ["ubuntu-latest", "windows-latest", "macos-latest", "22.13.0", "24"])
    expect(workflow).toContain(value);
  for (const command of ["pnpm test", "pnpm typecheck", "smoke-first-run.ps1"])
    expect(workflow).toContain(command);
});
```

Also assert:

- every `uses:` line ends with a human-readable release comment matching `# v<major>...`;
- `.github/workflows/security.yml` contains `pnpm audit --prod`, `javascript-typescript`,
  `security-events: write`, `schedule`, and `workflow_dispatch`.
- `.github/dependabot.yml`, `.github/CODEOWNERS`, `SECURITY.md`, and
  `docs/operations/repository-protection.md` exist and are non-empty.
- `.github/dependabot.yml` contains both `package-ecosystem: "npm"` and
  `package-ecosystem: "github-actions"`.

### Step 1.2 — Write source-truth contracts

Read the App README, server README, 015 quickstart, and live-smoke checklist separately. Assert every
permission document contains the complete canonical permission set; assert every operator/runtime
document contains all four variables. This must not be one combined-string assertion because that
would allow one correct document to hide drift in another.

```ts
for (const doc of permissionDocs) {
  for (const permission of ["metadata: read", "contents: read", "pull_requests: read", "checks: write"])
    expect(doc).toContain(permission);
}

for (const doc of runtimeDocs) {
  for (const name of [
    "AKER_BUILD_APP_ID",
    "AKER_BUILD_APP_PRIVATE_KEY",
    "AKER_BUILD_WEBHOOK_SECRET",
    "AKER_BUILD_INSTALLATION_ID",
  ]) expect(doc).toContain(name);
}

expect(permissionDocs.join("\n")).not.toContain("TG_SMOKE_");
expect(permissionDocs.join("\n")).not.toContain("A production entrypoint that binds an HTTP listener");
expect(read("README.md")).not.toContain("GitHub App, hosted dashboard");
```

Assert 014/015 spec and plan statuses contain `Implemented`, and their task documents link their
evidence documents. Do not assert every checkbox is complete: incomplete work must remain honest.

### Step 1.3 — Confirm RED

Run:

```powershell
pnpm --filter @aker-build/eval test -- repository-baseline
```

Expected: FAIL because mutable Action tags, missing security baseline files, stale App docs, and
legacy smoke variable names still exist.

## Task 2: Isolate Every Committing Git Fixture

**Files**:

- Create: `packages/eval/fixtures/hostile-gitconfig`
- Modify: `packages/cli/tests/cli.review.test.ts`
- Modify: `packages/review/tests/helpers.ts`
- Modify: `packages/review/tests/e2e-chain.test.ts`
- Modify: `packages/github-app-server/tests/git-workspace-real.test.ts`
- Modify: `packages/github-app-server/tests/real-review.test.ts`

### Step 2.1 — Configure repositories before the first commit

Immediately after identity configuration in every committing fixture, add:

```ts
git("config", "commit.gpgsign", "false");
git("config", "core.hooksPath", ".git/aker-build-no-hooks");
git("config", "core.excludesFile", ".git/aker-build-no-global-ignore");
```

Adapt the first argument for helpers whose `git` function takes `cwd`. For direct `execFileSync`
calls, use the equivalent argument arrays. Keep or remove existing per-command
`-c commit.gpgsign=false`; the local setting is mandatory and the result must remain readable.

Do not modify non-committing helpers solely because they configure an identity.

### Step 2.2 — Prove the focused fixtures under hostile inherited signing

Create a safe, non-secret global-config fixture:

```gitconfig
[commit]
    gpgsign = true
[user]
    signingkey = aker-build-ci-invalid-signing-key
```

In one PowerShell process, point Git's global-config lookup at that fixture and run only the packages
that create commits. `GIT_CONFIG_GLOBAL` models inherited global configuration; do not use
`GIT_CONFIG_COUNT`, because command-scope config would incorrectly override the repository-local
setting under test.

```powershell
$env:GIT_CONFIG_GLOBAL = (Resolve-Path "packages/eval/fixtures/hostile-gitconfig").Path
$env:GIT_CONFIG_NOSYSTEM = "1"
pnpm --filter @aker-build/cli --filter @aker-build/review --filter @aker-build/github-app-server test
```

Expected: PASS. The environment is process-scoped; do not call `git config --global`.

## Task 3: Reconcile 014/015 Evidence and Documentation

**Files**:

- Create: `specs/014-github-app-report-only/implementation-evidence.md`
- Create: `specs/015-github-app-deployment/acceptance-evidence.md`
- Modify the scoped 014/015 spec, plan, task, quickstart, and live-smoke files
- Modify: `README.md`, `CLAUDE.md`, package App READMEs, live-smoke test

### Step 3.1 — Trace every historical task before changing its checkbox

For each 014 and 015 task ID, record:

```markdown
| Task | Status | Evidence | Notes |
|---|---|---|---|
| T007 | Implemented | `packages/github-app/tests/webhook.test.ts` | Signature and action filter. |
```

Evidence must be an existing implementation, test, doc, or recorded validation. A task without
evidence stays `[ ]` and the table states why. Update task status headings only after this pass.

### Step 3.2 — Classify 015 acceptance claims

In `acceptance-evidence.md`, map every 015 acceptance scenario and success criterion to exactly one
of:

- `automated` — covered by a named test;
- `gated-live-smoke` — only runs with `AKER_BUILD_SMOKE=1` and real credentials;
- `manual-operator` — public webhook/UI/uninstall inspection;
- `unmet` — no valid evidence.

The document must say that skipped live tests are not a pass and that hosted field verification is
not certified by the normal test suite.

### Step 3.3 — Correct canonical status and operations docs

- Root README: App is implemented/self-hostable/report-only; dashboard, enforcement, auto-fix,
  auto-commit, auto-merge, and agent execution remain deferred.
- CLI README: link the self-hostable App as the report-only hosted transport over the same review
  engine; do not imply the App is a CLI subcommand or published binary.
- CLAUDE: active feature becomes 016; Action and App are present, not "later". Keep hard safety rules.
- 014/015 spec and plan statuses: `Implemented` only to the extent supported by the evidence tables.
- Server README and 015 quickstart: document the existing `src/bin.ts`/`start()` composition and the
  TS-aware in-repo invocation without claiming a published/bundled binary (owned by 020).
- All operator docs: name the four runtime variables and four canonical permissions.
- Replace `TG_SMOKE_OWNER`, `TG_SMOKE_REPO`, `TG_SMOKE_PR`, `TG_SMOKE_HEAD_SHA` with
  `AKER_BUILD_SMOKE_OWNER`, `AKER_BUILD_SMOKE_REPO`, `AKER_BUILD_SMOKE_PR`, and
  `AKER_BUILD_SMOKE_HEAD_SHA` in test and docs.
- Remove hard-coded automated-suite counts such as `379-green`; use "the automated suite".

### Step 3.4 — Run focused App tests

```powershell
pnpm --filter @aker-build/github-app test
pnpm --filter @aker-build/github-app-server test
```

Expected: PASS with live-smoke tests explicitly skipped unless the operator flag is set.

## Task 4: Harden the Main Quality Workflow

**File**: `.github/workflows/aker-build.yml`

### Step 4.1 — Pin existing actions and constrain execution

- Replace every tag reference with the reviewed checkout/setup-node SHA.
- Add `concurrency` keyed by workflow and ref with `cancel-in-progress: true`.
- Set workflow scope to `contents: read`; grant `pull-requests: read` only on the `review` job that
  calls `gh pr view`. Quality and benchmark jobs do not receive pull-request permission.
- Preserve report-only dogfood semantics and the opt-in critical gate exactly; do not make findings
  fail by default.

### Step 4.2 — Add the quality matrix

Add a `quality` job with display name `Quality (${{ matrix.name }})`, `fail-fast: false`, and:

```yaml
matrix:
  include:
    - name: minimum-node
      os: ubuntu-latest
      node: 22.13.0
      smoke: false
    - name: linux-lts
      os: ubuntu-latest
      node: 24
      smoke: true
    - name: windows-lts
      os: windows-latest
      node: 24
      smoke: true
    - name: macos-lts
      os: macos-latest
      node: 24
      smoke: false
```

Each entry checks out, sets up Node with `package-manager-cache: false`, enables Corepack, installs
with the frozen lockfile, runs `corepack pnpm typecheck`, and runs `corepack pnpm test`.

At job scope point global Git config at the deliberately invalid inherited signing fixture:

```yaml
env:
  GIT_CONFIG_GLOBAL: ${{ github.workspace }}/packages/eval/fixtures/hostile-gitconfig
  GIT_CONFIG_NOSYSTEM: "1"
```

For `matrix.smoke == true`, run:

```yaml
- name: Run first-run smoke
  if: ${{ matrix.smoke }}
  shell: pwsh
  run: ./scripts/smoke-first-run.ps1 -RemoveTemp
```

Keep the explicit benchmark job, update it to Node 24, and pin its actions.

## Task 5: Add the Supply-Chain and Repository Policy Baseline

**Files**:

- Create: `.github/workflows/security.yml`
- Create: `.github/dependabot.yml`
- Create: `.github/CODEOWNERS`
- Create: `SECURITY.md`
- Create: `docs/operations/repository-protection.md`

### Step 5.1 — Add the security workflow

Trigger on pull requests, pushes to `main`, a weekly schedule, and `workflow_dispatch`. At workflow
scope set `contents: read`. Add:

1. `dependency-audit`: checkout, setup Node 24, Corepack, frozen install, `corepack pnpm audit --prod`.
2. `codeql`: job permissions `contents: read`, `packages: read`, `security-events: write`, and
   `pull-requests: read`; initialize and analyze `javascript-typescript` with the reviewed CodeQL SHA.

Do not use `continue-on-error`, automatic fixes, dependency caching, or write permissions beyond
CodeQL's SARIF upload.

Before treating the hosted CodeQL run as operational, confirm repository settings are not already
using CodeQL default setup. If default setup is active, the owner must choose one configuration and
disable the duplicate; do not weaken or silently skip the committed advanced workflow.

### Step 5.2 — Add Dependabot

Use version 2 configuration with weekly root entries for ecosystems `npm` and `github-actions`.
Group non-major development/runtime updates separately where supported, cap open PRs, and target
`main`. Dependabot proposes changes; it never auto-merges.

### Step 5.3 — Add ownership and disclosure policy

`.github/CODEOWNERS`:

```text
* @Kemetra
/.github/ @Kemetra
/packages/github-app/ @Kemetra
/packages/github-app-server/ @Kemetra
```

`SECURITY.md` must direct private vulnerability reports to GitHub Security Advisories, warn against
including credentials or exploit secrets in public issues, define `main`/latest as the supported
pre-1.0 line, and state expected acknowledgement without promising an unsupported SLA.

### Step 5.4 — Document branch protection as an external operation

`docs/operations/repository-protection.md` must list these recommended required checks after their
first successful hosted run:

```text
Quality (minimum-node)
Quality (linux-lts)
Quality (windows-lts)
Quality (macos-lts)
benchmark
dependency-audit
codeql
```

It must state that the `review` dogfood job remains advisory, required checks do not authorize
auto-merge, and enabling settings is not complete merely because this document exists.

## Task 6: Make the Baseline Contracts Green

### Step 6.1 — Run the repository contract test

```powershell
pnpm --filter @aker-build/eval test -- repository-baseline
```

Expected: PASS.

### Step 6.2 — Review the implementation diff as an external reviewer

Reject the implementation if any of these are true:

- a historical checkbox lacks linked evidence;
- a workflow uses a tag, branch, or short SHA;
- a job has broader permissions than its API calls require;
- a live/manual claim is presented as automated;
- App docs omit `pull_requests: read` or `AKER_BUILD_INSTALLATION_ID`;
- the diff touches production source, manifests, or lockfile;
- the dogfood check becomes enforcing or any mutation surface appears.

## Task 7: Full Verification and Handoff

Run in this order:

```powershell
pnpm --filter @aker-build/eval test
pnpm test
pnpm typecheck
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
pnpm audit --prod
git diff --check
git -c safe.directory=C:/Users/user/Documents/GitHub/Aker-Build status --short
```

Expected:

- all automated tests pass; three live tests remain skipped unless explicitly configured;
- typecheck passes;
- smoke passes and removes its temp directory;
- production audit reports zero vulnerabilities;
- diff check is clean;
- status contains only allowed files and no `pnpm-lock.yaml`.

Hosted-only handoff evidence, not locally claimable:

1. all quality-matrix, benchmark, audit, and CodeQL jobs complete once on GitHub;
2. the owner enables the documented required checks in repository settings;
3. an operator runs the credential-gated App smoke/full webhook checklist when credentials and a
   public endpoint are available.

No commit or push step is included because repository policy requires a separate explicit request.

## Risks and Stop Conditions

| Risk | Control / stop condition |
|---|---|
| Historical tasks are overstated | Stop and leave unchecked unless implementation/test evidence exists. |
| New Actions release lands during work | Do not silently repin; use the reviewed pins above or re-run external review. |
| Security workflow fails due GitHub plan/settings | Preserve correct workflow and report hosted limitation; do not weaken permissions or disable the job. |
| Audit registry is temporarily unavailable | Retry only with approval/network access; do not mark green from cached assumptions. |
| Git isolation needs production helper changes | Stop; 016 permits test files only. |
| Docs imply a published App binary | Correct to TS-aware in-repo runtime; distribution is 020. |
| Scope reaches runtime/features | Stop and route to 017-021. |
