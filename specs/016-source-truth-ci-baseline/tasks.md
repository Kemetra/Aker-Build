---
description: "Executable task list for 016-source-truth-ci-baseline"
---

# Tasks: Source Truth and CI Baseline

**Status**: Implemented and externally reviewed locally (2026-07-17); hosted handoff pending
**Inputs**: `spec.md`, `plan.md`, and the approved production-trust program design
**Tests**: Required. Repository contracts are RED before documentation/workflow changes.
**Dependency changes**: None. `pnpm-lock.yaml` and package manifests are forbidden.
**Git operations**: No commit, push, PR, or repository-settings mutation without a separate request.

## Phase 1: State and Contract Tests

- [x] T001 Verify branch/status, re-read 016 spec/plan/tasks, and stop on unrelated changes.
- [x] T002 Confirm the allowed/forbidden file lists; specifically confirm no production `src`,
      manifest, or lockfile change is needed.
- [x] T003 Add `packages/eval/tests/repository-baseline.test.ts` with contracts for full-SHA Action
      pins, CI platform/Node/command coverage, security workflow, Dependabot, policy files, canonical
      App variables/permissions, reconciled statuses, and absence of legacy/stale phrases.
- [x] T004 Run `pnpm --filter @aker-build/eval test -- repository-baseline` and record the expected
      RED result before implementation.

## Phase 2: Deterministic Git Fixtures

- [x] T005 Add `packages/eval/fixtures/hostile-gitconfig`, then add local
      `commit.gpgsign=false`, isolated hooks path, and isolated excludes path before
      the first commit in `packages/cli/tests/cli.review.test.ts`.
- [x] T006 Add the same local fixture isolation in `packages/review/tests/helpers.ts` and
      `packages/review/tests/e2e-chain.test.ts`.
- [x] T007 Add the same local fixture isolation in
      `packages/github-app-server/tests/git-workspace-real.test.ts` and both repository builders in
      `packages/github-app-server/tests/real-review.test.ts`.
- [x] T008 Point `GIT_CONFIG_GLOBAL` at the hostile signing fixture, run CLI/review/App-server tests,
      and verify PASS without changing the machine's actual global Git config. Do not use
      command-scope `GIT_CONFIG_COUNT` for this proof.

## Phase 3: Historical Evidence and Source Truth

- [x] T009 Create `specs/014-github-app-report-only/implementation-evidence.md`; map every 014 task
      to implementation/test/doc evidence or an explicit incomplete reason.
- [x] T010 Reconcile 014 spec/plan status and task checkboxes/links strictly from T009 evidence.
- [x] T011 Create `specs/015-github-app-deployment/acceptance-evidence.md`; map every 015 task,
      acceptance scenario, and success criterion to automated, gated live smoke, manual operator,
      or unmet evidence.
- [x] T012 Reconcile 015 spec/plan status and task checkboxes/links strictly from T011 evidence.
- [x] T013 Update 014/015 quickstarts and package READMEs to describe the implemented host/adapters,
      the TS-aware in-repo start path, all four runtime variables, and the canonical permissions.
- [x] T014 Rename `TG_SMOKE_*` to `AKER_BUILD_SMOKE_*` in the live-smoke test/checklist, remove stale
      suite counts, and keep live tests honestly skipped by default.
- [x] T015 Update root README and CLAUDE status/active-feature guidance while preserving P5/P6,
      mutation, secret, and agent-execution prohibitions.
- [x] T016 Run focused GitHub App and App-server tests; verify the normal suite does not claim live
      field verification.

## Phase 4: Continuous Integration

- [x] T017 Pin every action in `.github/workflows/aker-build.yml` to the reviewed full SHA with a
      version comment; add concurrency cancellation.
- [x] T018 Add the four-entry quality matrix for Ubuntu/Windows/macOS, Node 22.13 minimum and Node 24
      LTS, frozen install, typecheck, full tests, and hostile inherited signing configuration.
- [x] T019 Run first-run smoke on Ubuntu/Node 24 and Windows/Node 24 matrix entries.
- [x] T020 Keep the explicit benchmark job, move it to Node 24, and preserve advisory dogfood review
      behavior and least-privilege permissions.

## Phase 5: Supply Chain and Repository Policy

- [x] T021 Add `.github/workflows/security.yml` with pinned actions, least privilege, production
      dependency audit, CodeQL JavaScript/TypeScript analysis, PR/main/schedule/manual triggers, and
      no auto-fix or ignored failure.
- [x] T022 Add `.github/dependabot.yml` for weekly root npm/pnpm and GitHub Actions updates without
      auto-merge.
- [x] T023 Add `.github/CODEOWNERS` for `@Kemetra` and security-sensitive workflow/App paths.
- [x] T024 Add `SECURITY.md` with private advisory reporting, secret-safe guidance, and honest
      pre-1.0 support language.
- [x] T025 Add `docs/operations/repository-protection.md` with exact recommended required checks,
      advisory dogfood status, and the explicit external settings step.

## Phase 6: Verification and External Review

- [x] T026 Re-run `pnpm --filter @aker-build/eval test -- repository-baseline`; verify GREEN.
- [x] T027 Run `pnpm --filter @aker-build/eval test`, `pnpm test`, and `pnpm typecheck`.
- [x] T028 Run `pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp`.
- [x] T029 Run `pnpm audit --prod`; require zero reported production vulnerabilities.
- [x] T030 Perform the plan's external-review rejection checklist: evidence honesty, immutable pins,
      least privilege, no runtime/feature drift, no secret/mutation surface, no lockfile.
- [x] T031 Run `git diff --check` and final status; confirm only allowed files changed.
- [x] T032 Report hosted-only gaps without claiming completion: first GitHub matrix/security/CodeQL
      run, branch-protection settings, and credential-gated live App verification.

## Completion Gate

016 is implementation-complete only when T001-T031 pass and T032 clearly records the hosted/manual
handoff. A missing hosted run does not invalidate the committed baseline, but operational protection
must remain labeled pending until GitHub evidence exists.
