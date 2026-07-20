# Reusable GitHub CI Integration Implementation Plan

> **Execution:** use `superpowers:executing-plans` with test-driven development.

**Goal:** Give consumer repositories a minimal, version-pinned, read-only GitHub
Actions job that runs the verified Aker Build npm CLI on pull requests.

**Architecture:** A `workflow_call`-only workflow checks out the caller PR head,
runs the exact package through `npx`, publishes the existing Markdown report,
and optionally evaluates the established critical-only predicate. A Vitest
contract suite parses both workflow and documented caller YAML and executes the
inline predicate. Documentation supersedes the old source-checkout recipe.

**Tech Stack:** GitHub Actions YAML, Node.js 22.14, `aker-build@0.1.0`, YAML 2,
Vitest 2, pnpm 11.

## Constraints

- No automatic trigger, consumer install/script, repository write, or artifact
  upload.
- No package manifest, lockfile, production TypeScript, CLI, engine, GitHub App,
  or hosted change.
- `workflow_call` is the sole trigger and `fail-on-critical` the sole input.
- Exact npm package and workflow release tag are `0.1.0` / `v0.1.0`.
- Publication, tag creation, push, PR, and live workflow run stay operator-owned.

## Files

| File | Responsibility |
|---|---|
| `.github/workflows/aker-build-review.yml` | Callable, read-only consumer job. |
| `packages/cli/tests/ci-workflow.test.ts` | Parse and execute the static CI contract. |
| `docs/ci/github-actions.md` | Canonical consumer caller and security model. |
| `docs/decisions/ADR-013-reusable-workflow-distribution.md` | Record distribution/runtime decision. |
| `docs/decisions/ADR-007-ci-runtime.md` | Mark old source-checkout runtime superseded externally. |
| Spec 008 quickstart/input contract | Redirect historical consumer guidance. |
| `README.md`, release/roadmap/status docs, `CLAUDE.md` | Reconcile product truth and operator prerequisites. |

## Task 1: Static Contract Test (RED)

**Create:** `packages/cli/tests/ci-workflow.test.ts`

- Parse `.github/workflows/aker-build-review.yml` with the existing `yaml`
  dependency and assert one `workflow_call` trigger, one boolean/default-false
  input, no secrets, exact read permissions, safe checkout, Node 22.14, exact
  package/commands/output path, always-run summary, and forbidden-token absence.
- Extract the consumer YAML block from `docs/ci/github-actions.md`; parse and
  assert `pull_request`, matching read permissions, exact reusable path at
  `v0.1.0`, and report-only default.
- Extract the exact inline `node -e` code from the enforcement step and execute
  it in temporary fixtures containing empty, non-critical, and critical
  `review.json` findings. Assert only the critical fixture exits non-zero and no
  finding content reaches output.
- Run `pnpm --filter @aker-build/cli test -- ci-workflow.test.ts` and retain the
  expected missing-workflow/docs RED result.

## Task 2: Callable Workflow (GREEN)

**Create:** `.github/workflows/aker-build-review.yml`

- Define only `workflow_call.inputs.fail-on-critical` as optional boolean false.
- Request only contents/pull-request reads.
- Checkout `${{ github.event.pull_request.head.sha }}` without persisted
  credentials, then set up exact Node 22.14.
- Run `npx --yes aker-build@0.1.0 doctor . --github --format json`, followed by
  `scan . --out .aker-build` and PR-number `review-pr` with the same out-dir.
- Append `review.md` to `$GITHUB_STEP_SUMMARY` under `if: always()` or append a
  clear missing-review diagnostic.
- Gate the inline, dependency-free critical predicate on the sole input.
- Run the focused test and CLI typecheck; commit test plus workflow only.

## Task 3: Consumer Guidance and Decision Record

**Create:** `docs/ci/github-actions.md`,
`docs/decisions/ADR-013-reusable-workflow-distribution.md`

**Modify:** ADR-007, Spec 008 quickstart/input contract, README, npm release
runbook, roadmap/status docs, CLAUDE, and Spec 020 documents.

- Document a minimal consumer `pull_request` caller at `@v0.1.0`, recommend a
  full SHA for immutable production use, and show the opt-in critical input.
- Explain report-only/error semantics, caller permissions, policy prerequisite,
  no consumer dependency execution, and operator-owned publication/tag order.
- Mark ADR-007's external source-checkout runtime superseded by ADR-013 while
  retaining its historical/dogfood context.
- Replace Spec 008's now-stale external recipe/inputs with a supersession notice
  pointing to the canonical guide; do not erase history.
- Reconcile project status without advancing deferred P5/P6.
- Rerun focused tests and namespace validation; commit documentation separately.

## Task 4: Full Verification and Local Integration

Run:

```powershell
pnpm check:namespace
pnpm test
pnpm typecheck
pnpm test:cli-package
pnpm dlx tsx packages/eval/src/bin.ts
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
git diff --check
```

Then audit changed paths against the allowed surface, confirm zero forbidden
tokens/manifests/lockfiles/generated artifacts, record exact evidence in
`tasks.md`, mark the spec implemented, and commit the evidence. Fast-forward the
local integration branch only after all checks pass; do not push.

## Stop Conditions

- The workflow requires write permission, a consumer script/install, an
  unpinned executable, or an input beyond the approved boolean.
- Local acceptance requires registry publication or any remote mutation.
- A production source, manifest, lockfile, GitHub App, hosted, P5, or P6 change
  becomes necessary.

## Plan Self-Review

- FR-001–FR-015 and SC-001–SC-005 map to Tasks 1–4.
- Runtime identifiers, versions, paths, permission names, commands, and predicate
  are consistent across the spec and plan.
- No unresolved marker or clarification remains.
