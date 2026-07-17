# Tasks: Diff-Aware PR Review

**Status**: Local implementation and verification complete; hosted Action/App evidence remains pending
**Git/release**: No commit, push, PR, settings mutation, credentialed live run, or release.

## Phase 1 - Review gate and RED contracts

- [x] T001 Reconcile the approved program design with current review/CLI/App/report seams.
- [x] T002 Write spec/plan/tasks and apply the external rejection checklist before code.
- [x] T003 Add RED v1/v2 schema and migration tests.
- [x] T004 Add RED fingerprint/multiset/classification/verdict tests.
- [x] T005 Add RED snapshot/no-index-diff immutability, containment, and line-range tests.
- [x] T006 Add RED renderer/Checks/report migration tests.
- [x] T007 Add RED local/PR/App adapter parity and base-SHA IPC tests.

## Phase 2 - Comparison core

- [x] T008 Add v2 types/schema plus frozen v1 acceptance.
- [x] T009 Add bounded context fingerprint without changing `findingId`.
- [x] T010 Add multiset pairing and material-attribute direction.
- [x] T011 Add changed-line structures/lookup and completeness contracts.
- [x] T012 Add comparison-driven verdict and v2 assembly.

## Phase 3 - Source adapters

- [x] T013 Add resolved Git-archive snapshots and conservative cleanup.
- [x] T014 Add working-tree overlay for tracked/staged/untracked/deleted paths.
- [x] T015 Add read-only no-index diff parser for changed head ranges.
- [x] T016 Add shared default scan/gates analysis for base and head.
- [x] T017 Add local CLI `--base` and default HEAD comparison.
- [x] T018 Add CLI PR base/head OIDs and full-history Action checkout.

## Phase 4 - Outputs and App

- [x] T019 Render v2 comparison/debt/resolved sections while retaining v1 rendering.
- [x] T020 Restrict v2 annotations to introduced/worsened changed lines.
- [x] T021 Make aggregate report validate/summarize v1 and v2.
- [x] T022 Require webhook base SHA and thread it through validated IPC.
- [x] T023 Run two App managed checkouts through the shared comparison and dispose both.
- [x] T024 Preserve draft-neutral, fixed incomplete checks, budgets, retries, and Checks-only writes.

## Phase 5 - Verification

- [x] T025 Update CLI/App/review/report docs and v1 migration notes.
- [x] T026 Run focused package tests and typechecks.
- [x] T027 Run full tests/typecheck, first-run smoke, and production audit.
- [x] T028 Apply external rejection checklist, diff/secret/scope review, and record evidence.
- [x] T029 Record hosted Action and registered-App parity as pending without claiming it passed.
