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
- [ ] T006 Commit test and workflow with exact named-file staging.

## Phase 3: Consumer Truth

- [ ] T007 Add the canonical consumer guide and ADR-013.
- [ ] T008 Mark ADR-007 and Spec 008 external guidance superseded.
- [ ] T009 Reconcile README, release prerequisites, roadmap/status, and active
  feature truth while keeping P5/P6 deferred.
- [ ] T010 Rerun focused tests, namespace check, and diff check; commit docs.

## Phase 4: Verification and Integration

- [ ] T011 Run workspace tests, typecheck, package acceptance, benchmark, and
  first-run smoke.
- [ ] T012 Audit the exact changed-file and forbidden-surface set.
- [ ] T013 Record evidence, mark Spec 020 implemented, and commit locally.
- [ ] T014 Fast-forward the local integration branch and rerun the integrated
  workspace suite; do not push.

## Stop Conditions

- Any write permission, consumer dependency/script execution, or mutable package
  resolution appears.
- A manifest, lockfile, production source, GitHub App, hosted, P5/P6, or remote
  change is required.
- Publication/tag prerequisites are mistaken for locally completed evidence.
