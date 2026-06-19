---
description: "Task list for 013-config-path-scope-enforcement"
---

# Tasks: Config Path Scope Enforcement

## Phase 1: Source Truth

- [X] T001 Verify repo state and branch before edits.
- [X] T002 Read scanner, gates, queue, review, CLI, and config path handling.
- [X] T003 Confirm this task approves path-filter enforcement only.

## Phase 2: Tests First

- [X] T004 Add config path-matching tests.
- [X] T005 Add scanner include/exclude tests.
- [X] T006 Add gates excluded-finding tests.
- [X] T007 Add review attribution/scope filter tests.

## Phase 3: Implementation

- [X] T008 Add reusable config path filter helpers.
- [X] T009 Apply path filter in scanner.
- [X] T010 Apply path filter in gates context.
- [X] T011 Apply path filter in review local and PR changed-file handling.
- [X] T012 Add CLI `--config` plumbing where needed.
- [X] T013 Update `CLAUDE.md` active feature pointer to 013.

## Phase 4: Validation

- [ ] T014 Run focused package tests.
- [ ] T015 Run `pnpm test` and `pnpm typecheck`.
- [ ] T016 Final status confirms no forbidden surfaces or unrelated changes.
