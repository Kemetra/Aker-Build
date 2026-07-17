# Tasks: GitHub App Runtime Fortification

**Status**: Local implementation and verification complete; operator evidence remains (2026-07-17)
**Inputs**: 017 spec/plan and approved program design
**Tests**: Required RED before implementation
**Git/release**: No commit, push, settings mutation, credentialed live run, or image publication.

## Phase 1 - Gate and RED tests

- [x] T001 Re-read scope/status and confirm no unrelated user changes overlap 017.
- [x] T002 Externally review and approve spec/plan/tasks before production edits.
- [x] T003 Add RED scanner budget tests for count, per-file, aggregate, usage, and unbounded default.
- [x] T004 Add RED schema/workspace tests for owner/repo validation, env-only auth, Git timeout,
      marker tracking, contained disposal, and conservative stale cleanup.
- [x] T005 Add RED intake/queue tests for headers, installation, in-progress visibility, activation
      order, dedupe, overflow, capacity release, and concurrency.
- [x] T006 Add RED reliability/operations tests for timeout/crash neutralization, retry classes,
      health/readiness/metrics, allowlisted logs, socket settings, and shutdown.
- [x] T007 Add RED build/container contract test.

## Phase 2 - Scanner and workspace boundaries

- [x] T008 Implement `ScanBudget`, `ScanUsage`, tracker/context, fixed error, and exports.
- [x] T009 Enforce file-count, per-file, and aggregate-read budgets in scanner IO without swallowing
      budget errors; preserve unbounded CLI default.
- [x] T010 Tighten owner/repository schema validation before remote construction.
- [x] T011 Move Git auth to allowlisted child environment and add the Git subprocess deadline.
- [x] T012 Add marker wrappers with separate `repo/` children, resolved tracking,
      nonce/containment disposal, `disposeAll`, and stale
      cleanup that ignores unowned/symlinked/out-of-root paths.

## Phase 3 - Intake, queue, and lifecycle Checks

- [x] T013 Add safe-range runtime config and fixed incomplete/outcome codes.
- [x] T014 Add bounded TTL delivery cache and reservable queue with concurrency/ready/drain state.
- [x] T015 Add GitHub lifecycle methods for idempotent `in_progress` create/update and completion.
- [x] T016 Implement intake ordering: verify -> event/schema -> installation/delivery -> reserve ->
      in-progress -> accepted response -> explicit activation.
- [x] T017 Add allowlisted metrics and structured logger with sentinel leak tests.

## Phase 4 - Workers and reliability

- [x] T018 Add child-worker job/result IPC schemas containing metadata/fixed codes only.
- [x] T019 Add fork executor with whole-job timeout, silent stdio, fixed crash outcomes, and
      termination/drain support.
- [x] T020 Add worker entry that composes credentials internally, applies the scan budget, processes
      one event, completes the same check, and disposes all workspaces.
- [x] T021 Add transient retry classification/backoff with idempotency re-find and metrics.
- [x] T022 Ensure timeout/crash/budget/queue paths update neutral or return retryable HTTP without
      false success or arbitrary messages.

## Phase 5 - HTTP operations and artifact

- [x] T023 Route webhook/health/readiness/metrics and set body/request/header/keep-alive/socket limits.
- [x] T024 Add graceful stop-admission, drain/terminate, cleanup, and listener close.
- [x] T025 Add build script/direct esbuild dependency and only its lockfile importer change.
- [x] T026 Add non-root Node 24 Dockerfile, health check, temp volume, `.dockerignore`, and read-only
      compose example; add non-publishing CI build.
- [x] T027 Update runtime/operator docs and source-truth status without claiming hosted/live proof.

## Phase 6 - Verification and external review

- [x] T028 Run focused scanner, App, and App-server tests.
- [x] T029 Run package build, full test suite, and typecheck.
- [x] T030 Run first-run smoke and `pnpm audit --prod`.
- [ ] T031 Build/smoke the container if Docker is available; otherwise record exact unavailable gap.
- [x] T032 Apply external rejection checklist, `git diff --check`, secret/scope audit, and final status.
- [ ] T033 Record hosted/live/TLS/settings handoff without marking it complete.

T031 is unavailable on this host because `docker` is not installed. T033 is recorded in the
operations guide and verification ledger but remains unchecked until operator evidence exists.

017 is locally implementation-complete only when T001-T030 and T032 pass. T031 may be explicitly
unavailable locally, and T033 must stay honest until operator evidence exists.
