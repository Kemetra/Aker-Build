---
description: "Task list for 012-report-command-and-output-contract"
---

# Tasks: Report Command and Output Contract

**Input**: `spec.md`, `plan.md`, current artifacts from packages project-map/gates/queue/review/config/spec-kit-adapter.

**Scope**: Add report package, report contract, CLI command, docs, and tests.

## Phase 1: Source Truth

- [X] T001 Verify repo state and branch before edits.
- [X] T002 Read source truth: 012 spec/plan, CLAUDE, CLI command patterns, queue/review/gates schemas, config and Spec Kit packages.
- [X] T003 Confirm allowed files and forbidden surfaces.

## Phase 2: Tests First

- [X] T004 Add failing report tests for full artifact summary.
- [X] T005 Add failing report tests for missing optional artifacts.
- [X] T006 Add failing report tests for visible suppressions and secret safety.
- [X] T007 Add failing CLI tests for `aker-build report`.

## Phase 3: Report Package

- [X] T008 Add `@aker-build/report` package with types, schema, loader, renderer, and writer.
- [X] T009 Add `contracts/report.schema.json` matching generated report JSON.
- [X] T010 Ensure generated report validates before write.

## Phase 4: CLI and Docs

- [X] T011 Add `aker-build report` command and exports.
- [X] T012 Update CLI and root docs to include report command.
- [X] T013 Update first-run smoke script to run report.
- [X] T014 Update `CLAUDE.md` active feature pointer to 012.

## Phase 5: Validation

- [X] T015 Run focused report and CLI tests.
- [X] T016 Run `pnpm test` and `pnpm typecheck`.
- [X] T017 Final status confirms no forbidden surfaces or unrelated changes.
