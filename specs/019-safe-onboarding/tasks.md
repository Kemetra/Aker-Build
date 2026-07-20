# Tasks: Safe Repository Onboarding

**Input**: `spec.md`, `research.md`, and `plan.md` in this directory.
**Execution**: TDD, exact named-file staging, local commits only.

## Phase 1: Config Boundary

- [x] T001 Add failing YAML/JSON starter-config round-trip tests.
- [x] T002 Implement behavior-neutral `renderStarterConfig`.
- [x] T003 Verify config tests and typecheck; commit the config boundary.

## Phase 2: Safe Init

- [x] T004 Add failing tests for creation, idempotency, preview, conflicts,
  invalid config, non-Git input, format validation, and exclusive-write races.
- [x] T005 Implement `runInit` with one exclusive config write and no overwrite.
- [x] T006 Register/export `init`; verify focused/full CLI tests and typecheck.
- [x] T007 Commit the init command with exact named-file staging.

## Phase 3: Read-Only Doctor

- [x] T008 Add failing tests for ordered local/GitHub checks, readiness, output
  parity, exit codes, credential non-disclosure, and zero writes.
- [x] T009 Implement the versioned doctor model and injected local probes.
- [x] T010 Implement text/JSON renderers and command exit mapping.
- [x] T011 Register/export `doctor`; verify focused/full CLI tests and typecheck.
- [x] T012 Commit doctor with exact named-file staging.

## Phase 4: Distribution Acceptance

- [x] T013 Extend the installed-tarball smoke with init/doctor and exact-mutation
  assertions.
- [x] T014 Run `pnpm test:cli-package`; commit package acceptance.

## Phase 5: Documentation and Truth

- [x] T015 Document `init → doctor → check` in root, CLI, and demo guidance.
- [x] T016 Reconcile Spec 019, roadmap/status, and active phase; keep P5/P6
  deferred and identify reusable CI packaging as the next candidate.
- [x] T017 Run namespace, stale-pointer, and diff checks; commit documentation.

## Phase 6: Verification

- [x] T018 Run namespace, workspace tests, typecheck, package acceptance,
  benchmark, first-run smoke, and diff checks.
- [x] T019 Audit the changed-file set against the approved surface and confirm no
  manifest, lockfile, workflow, generated artifact, or remote mutation.
- [x] T020 Record exact evidence, mark Spec 019 implemented, and create the local
  verification commit.

## Stop Conditions

- Any command would overwrite an existing config or modify `.gitignore`.
- A credential value or secret-like config content reaches output.
- Implementation requires a dependency, manifest, lockfile, workflow, gate,
  scanner, hosted, or remote change.
- Baseline behavior regresses outside the approved command surface.

## Verification Evidence — 2026-07-20

- TDD RED evidence: config tests failed because `renderStarterConfig` was absent;
  init tests failed because `runInit` was absent; doctor tests failed because
  its model/renderers/command and CLI registration were absent.
- Focused GREEN: config 11/11; init 11/11; doctor 15/15; full CLI 62/62;
  focused config and CLI typechecks exited 0.
- Namespace: `pnpm check:namespace` passed with 346 active files scanned.
- Workspace: `pnpm test` passed 450 tests with only 3 credential-gated live App
  smokes skipped; `pnpm typecheck` passed all 13 participating packages.
- Distribution: `pnpm test:cli-package` passed 21/21 and installed the exact
  five-file, zero-dependency `aker-build-0.1.0.tgz`; bundled init/doctor smoke
  passed without publication.
- Detection regression: all 19 benchmark cases passed; every measured gate/tier
  row remained 100% precision/recall with zero false positives or negatives.
- First run: `scripts/smoke-first-run.ps1 -RemoveTemp` passed, reproduced the
  expected TG-G4/scope verdict, and removed its temporary directory.
- Source smoke: local doctor returned `ready`; JSON init preview returned only
  `{ "version": 1 }` and wrote no file.
- Scope: no manifest, lockfile, workflow, generated release artifact, hosted
  surface, remote mutation, public publication, tag, push, PR, or dispatch.
