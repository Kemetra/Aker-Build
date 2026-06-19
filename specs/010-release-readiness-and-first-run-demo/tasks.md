---
description: "Task list for 010-release-readiness-and-first-run-demo"
---

# Tasks: Release Readiness and First-Run Demo

**Input**: `spec.md`, `plan.md`, current CLI wiring, post-foundation reconciliation docs.
**Prerequisites**: 010 spec and plan, maintainer approval to create tasks and implement this slice.

**Scope**: This slice is release hardening, documentation, example fixture, and smoke validation only.
It does not implement production product behavior.

**Allowed files**:

```text
README.md
CLAUDE.md
CONTRIBUTING.md
LICENSE
docs/status/**
docs/roadmap/**
docs/demo/**
docs/decisions/ADR-008-post-foundation-sequence.md
packages/cli/README.md
specs/009-launch-and-community-strategy/spec.md
specs/010-release-readiness-and-first-run-demo/**
examples/multi-tenant-saas-basic/**
scripts/smoke-first-run.ps1
```

**Forbidden files**:

```text
Hosted dashboard code
GitHub App code
Auto-fix / auto-commit / auto-merge behavior
Secret/env files
Retail Tower / ERPNext / POS-specific rules
Package rewrites or lockfile changes
```

## Phase 1: Source Truth and Task Approval

- [X] T001 Verify repo state and branch before edits; stop on unrelated uncommitted changes.
- [X] T002 Read source truth: 010 spec/plan, README, CLAUDE, constitution, CLI source, CLI README, and 009 strategy.
- [X] T003 Confirm this task file approves only docs/example/smoke work and no production code.

## Phase 2: Documentation Reconciliation

- [X] T004 Update README status and quickstart so a first-time user can run the MVP chain honestly.
- [X] T005 Update `packages/cli/README.md` to document every implemented command wired in `packages/cli/src/index.ts`.
- [X] T006 Update `CLAUDE.md` active phase / active feature pointer so agents do not route back to completed 009.
- [X] T007 Update `specs/009-launch-and-community-strategy/spec.md` status line only, preserving strategic content.
- [X] T008 Add `CONTRIBUTING.md` with setup, workflow, PR expectations, and scoped first-issue guidance.
- [X] T009 Confirm `LICENSE` exists; do not change it if already present.

## Phase 3: First-Run Demo

- [X] T010 Add `examples/multi-tenant-saas-basic/`, a sanitized domain-neutral SaaS fixture.
- [X] T011 Ensure the example includes detectable architecture/security/contract/idempotency cues without secrets or private domain logic.
- [X] T012 Add `docs/demo/first-run.md` with the full scan -> gates -> queue -> route -> prompt -> review sequence.

## Phase 4: Smoke Validation

- [X] T013 Add `scripts/smoke-first-run.ps1` that copies the example to a temp git repo, runs the full CLI chain, creates a controlled local diff, and verifies expected outputs.
- [X] T014 Run the smoke script and record the result.
- [X] T015 Run `pnpm test` and `pnpm typecheck`.

## Phase 5: Final Review

- [X] T016 Check for stale command/docs references and ADR numbering drift.
- [X] T017 Check git status and confirm no forbidden files or lockfiles changed.
- [X] T018 Final report includes files changed, summary, tests, evidence, risks/gaps, git status, and next safe action.
