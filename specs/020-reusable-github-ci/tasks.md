# Tasks: Reusable GitHub CI Integration

**Input:** `spec.md`, `research.md`, and `plan.md` in this directory.
**Execution:** TDD, exact named-file staging, local commits only.

## Phase 1: Contract Test

- [x] T001 Add YAML contract tests for workflow, documented caller, security,
  commands, summary, and forbidden behavior.
- [x] T002 Add exact inline predicate execution tests for empty, non-critical,
  and critical fixtures.
- [x] T003 Run and retain the expected missing-surface RED result.

## Phase 2: Reusable Workflow

- [x] T004 Add the `workflow_call`-only, read-only workflow.
- [x] T005 Run focused GREEN tests and CLI typecheck.
- [x] T006 Commit test and workflow with exact named-file staging.

## Phase 3: Consumer Truth

- [x] T007 Add the canonical consumer guide and ADR-013.
- [x] T008 Mark ADR-007 and Spec 008 external guidance superseded.
- [x] T009 Reconcile README, release prerequisites, roadmap/status, and active
  feature truth while keeping P5/P6 deferred.
- [x] T010 Rerun focused tests, namespace check, and diff check; commit docs.

## Phase 4: Verification and Integration

- [x] T011 Run workspace tests, typecheck, package acceptance, benchmark, and
  first-run smoke.
- [x] T012 Audit the exact changed-file and forbidden-surface set.
- [x] T013 Record evidence, mark Spec 020 implemented, and commit locally.
- [ ] T014 Fast-forward the local integration branch and rerun the integrated
  workspace suite; do not push.

## Stop Conditions

- Any write permission, consumer dependency/script execution, or mutable package
  resolution appears.
- A manifest, lockfile, production source, GitHub App, hosted, P5/P6, or remote
  change is required.
- Publication/tag prerequisites are mistaken for locally completed evidence.

## Verification Evidence — 2026-07-20

- TDD RED: after correcting a test-interface typo, all eight contract tests
  failed with `ENOENT` for the intentionally absent reusable workflow/consumer
  guide. No production surface existed yet.
- Focused GREEN: reusable-workflow contract 8/8 and CLI typecheck passed. Tests
  parse workflow/caller YAML, enforce sole trigger/input and exact permissions,
  pin checkout/runtime/package/commands, reject unsafe tokens, and execute the
  exact inline predicate against empty, non-critical, and critical fixtures.
- Namespace: `pnpm check:namespace` passed with 348 active files scanned.
- Workspace: `pnpm test` passed 458 tests with only 3 credential-gated live App
  smokes skipped; `pnpm typecheck` passed all 13 participating packages.
- Distribution: `pnpm test:cli-package` passed 21/21 and installed the exact
  five-file, zero-production-dependency `aker-build-0.1.0.tgz`.
- Detection regression: all 19 benchmark cases met every committed threshold;
  every measured gate/tier row remained 100% precision/recall with zero false
  positives or false negatives.
- First run: `scripts/smoke-first-run.ps1 -RemoveTemp` passed the documented
  scan-to-review flow and removed its temporary directory.
- Scope/security: the branch differs from the local integration base by exactly
  19 approved files. There is no manifest, lockfile, production package, GitHub
  App, hosted, release artifact, write permission, consumer install/script,
  persisted checkout credential, mutable package resolution, or remote change.
- Live proof remains operator-owned: npm publication, tag/push, consumer opt-in,
  and cross-repository workflow execution were not performed locally.
