# Tasks: Safe Repository Onboarding

**Input**: `spec.md`, `research.md`, and `plan.md` in this directory.
**Execution**: TDD, exact named-file staging, local commits only.

## Phase 1: Config Boundary

- [ ] T001 Add failing YAML/JSON starter-config round-trip tests.
- [ ] T002 Implement behavior-neutral `renderStarterConfig`.
- [ ] T003 Verify config tests and typecheck; commit the config boundary.

## Phase 2: Safe Init

- [ ] T004 Add failing tests for creation, idempotency, preview, conflicts,
  invalid config, non-Git input, format validation, and exclusive-write races.
- [ ] T005 Implement `runInit` with one exclusive config write and no overwrite.
- [ ] T006 Register/export `init`; verify focused/full CLI tests and typecheck.
- [ ] T007 Commit the init command with exact named-file staging.

## Phase 3: Read-Only Doctor

- [ ] T008 Add failing tests for ordered local/GitHub checks, readiness, output
  parity, exit codes, credential non-disclosure, and zero writes.
- [ ] T009 Implement the versioned doctor model and injected local probes.
- [ ] T010 Implement text/JSON renderers and command exit mapping.
- [ ] T011 Register/export `doctor`; verify focused/full CLI tests and typecheck.
- [ ] T012 Commit doctor with exact named-file staging.

## Phase 4: Distribution Acceptance

- [ ] T013 Extend the installed-tarball smoke with init/doctor and exact-mutation
  assertions.
- [ ] T014 Run `pnpm test:cli-package`; commit package acceptance.

## Phase 5: Documentation and Truth

- [ ] T015 Document `init → doctor → check` in root, CLI, and demo guidance.
- [ ] T016 Reconcile Spec 019, roadmap/status, and active phase; keep P5/P6
  deferred and identify reusable CI packaging as the next candidate.
- [ ] T017 Run namespace, stale-pointer, and diff checks; commit documentation.

## Phase 6: Verification

- [ ] T018 Run namespace, workspace tests, typecheck, package acceptance,
  benchmark, first-run smoke, and diff checks.
- [ ] T019 Audit the changed-file set against the approved surface and confirm no
  manifest, lockfile, workflow, generated artifact, or remote mutation.
- [ ] T020 Record exact evidence, mark Spec 019 implemented, and create the local
  verification commit.

## Stop Conditions

- Any command would overwrite an existing config or modify `.gitignore`.
- A credential value or secret-like config content reaches output.
- Implementation requires a dependency, manifest, lockfile, workflow, gate,
  scanner, hosted, or remote change.
- Baseline behavior regresses outside the approved command surface.
