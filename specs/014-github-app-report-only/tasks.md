---
description: "Task list for 014-github-app-report-only"
---

# Tasks: Report-Only GitHub App

**Input**: Design documents from `specs/014-github-app-report-only/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/webhook-and-checks.md

**Tests**: REQUIRED — the repo follows TDD (write tests first, RED→GREEN); every package ships with Vitest tests. Test tasks precede implementation within each story.

**Status**: Not started — docs-only until 014 is approved. No implementation begins before approval (constitution).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1 / US2 / US3 (maps to spec.md user stories)
- All paths are repository-relative.

---

## Phase 1: Setup (Shared Infrastructure)

- [ ] T001 Verify repo state, branch, and confirm allowed/forbidden files from `specs/014-github-app-report-only/plan.md` before any edit.
- [ ] T002 Scaffold `packages/github-app/` workspace package (package.json, tsconfig, vitest config) matching the existing `packages/report` package conventions.
- [ ] T003 [P] Add `@aker-build/github-app` to the pnpm workspace and declare read-only deps on `@aker-build/review`, `@aker-build/report`, `@aker-build/config` (update `pnpm-lock.yaml` for the new manifest only).

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: must complete before any user-story work.

- [ ] T004 Define Zod boundary schemas for `WebhookEvent` and the Checks output payload in `packages/github-app/src/types.ts`, per `data-model.md` and `contracts/webhook-and-checks.md`.
- [ ] T005 [P] Implement the write-allowlist guard in `packages/github-app/src/safety.ts` — a single chokepoint that permits ONLY create/update check-run + annotations and throws on any other GitHub write (FR-007/FR-014).
- [ ] T006 [P] Add the test for the write-allowlist guard in `packages/github-app/tests/safety.test.ts` (asserts commit/push/merge/label/review-request are unreachable) — write FIRST, must fail before T005 lands.

**Checkpoint**: boundary types + safety chokepoint exist; story work can begin.

---

## Phase 3: User Story 1 — Findings on a PR with no local setup (Priority: P1) 🎯 MVP

**Goal**: An opened PR gets an Aker Build Checks run at the head ref with findings at the correct `file:line`; the App makes no repo write beyond the check.

**Independent Test**: Fire a faked `pull_request.opened` payload introducing a known `confirmed` finding → assert a check is created at `headSha` with an annotation at the correct file:line and zero other writes.

### Tests first (RED)

- [ ] T007 [P] [US1] Webhook intake test in `packages/github-app/tests/webhook.test.ts` — signature-verify pass/fail, action filter (opened/reopened/synchronize accepted; others → no check), per `contracts` Contract A.
- [ ] T008 [P] [US1] Review-runner test in `packages/github-app/tests/review-runner.test.ts` — given a faked PR head + diff, the existing `review-pr` chain is invoked and findings flow through (mock the engine boundary).
- [ ] T009 [P] [US1] Checks-output test in `packages/github-app/tests/checks.test.ts` — a `confirmed` finding renders an annotation at the correct file:line and a non-success conclusion (FR-003/FR-004).

### Implementation (GREEN)

- [ ] T010 [US1] Implement `packages/github-app/src/webhook.ts` — HMAC verify then parse to `WebhookEvent`, drop ignored actions (R2, Contract A).
- [ ] T011 [US1] Implement `packages/github-app/src/review-runner.ts` — resolve PR head ref, compute changed files, invoke `@aker-build/review` review-pr; per-event fetch-and-discard, no persistence (R5/FR-008).
- [ ] T012 [US1] Implement `packages/github-app/src/checks.ts` (core path) — map findings to a check-run + annotations via the merged Checks renderer; route ALL writes through `safety.ts` (FR-007).
- [ ] T013 [US1] Implement `packages/github-app/src/index.ts` — deployable handler wiring webhook → runner → checks, returning the Checks result.

**Checkpoint**: US1 independently demoable — open PR → check with correct annotation, no other writes.

---

## Phase 4: User Story 2 — Tiers keep the PR readable (Priority: P2)

**Goal**: `confirmed` findings are prominent and drive a non-success conclusion; `suspected` are collapsed; annotations capped at 50 with overflow summarized; drafts always neutral.

**Independent Test**: A PR with 1 confirmed + many suspected + >50 total findings → confirmed annotation prominent, conclusion driven by confirmed, suspected collapsed, ≤50 annotations, remainder in summary; a draft variant concludes neutral.

### Tests first (RED)

- [ ] T014 [P] [US2] Tier-presentation test in `packages/github-app/tests/checks.test.ts` — confirmed→prominent+non-success, suspected-only→neutral+collapsed (FR-005, R4).
- [ ] T015 [P] [US2] Annotation-bound test in `packages/github-app/tests/checks.test.ts` — >50 findings → exactly ≤50 annotations, confirmed-first ordering, overflow in summary (FR-006/SC-005, R3).
- [ ] T016 [P] [US2] Draft-PR test in `packages/github-app/tests/checks.test.ts` — `draft:true` with confirmed findings → conclusion neutral (FR-015).

### Implementation (GREEN)

- [ ] T017 [US2] Extend `packages/github-app/src/checks.ts` — tier-driven presentation (prominent vs collapsed) and conclusion mapping per R4.
- [ ] T018 [US2] Add the ≤50 annotation cap + confirmed-first ordering + overflow summary in `packages/github-app/src/checks.ts` (FR-006).
- [ ] T019 [US2] Add the draft→neutral override in `packages/github-app/src/checks.ts` driven by `WebhookEvent.isDraft` (FR-015).

**Checkpoint**: US2 independently demoable — readable, non-flooded, draft-safe presentation.

---

## Phase 5: User Story 3 — Legible, minimal, auditable safety boundary (Priority: P3)

**Goal**: Minimum permissions; no persistence of source/secrets; honest non-error status on every degraded path; consistent with CLI verdict.

**Independent Test**: Run fork / missing-permission / timeout / unanalyzable cases → each concludes neutral with an honest message, never false success; assert zero persisted source/secret and zero non-check writes across all runs.

### Tests first (RED)

- [ ] T020 [P] [US3] Degraded-path tests in `packages/github-app/tests/checks.test.ts` — fork/missing-perm/timeout/unanalyzable → neutral + honest message, never success (FR-011).
- [ ] T021 [P] [US3] Secret-safety + no-persistence test in `packages/github-app/tests/review-runner.test.ts` — secret-like content flagged not captured; nothing written to any store (FR-008/FR-009/SC-004).
- [ ] T022 [P] [US3] Idempotency test in `packages/github-app/tests/checks.test.ts` — repeated `synchronize` for same head updates (not duplicates) the check (FR-012).
- [ ] T023 [P] [US3] Consistency test in `packages/github-app/tests/review-runner.test.ts` — App conclusion + finding set equals CLI `review-pr` for the same diff (FR-013/SC-006).

### Implementation (GREEN)

- [ ] T024 [US3] Implement degraded-path handling in `packages/github-app/src/review-runner.ts` and `checks.ts` — every incomplete review concludes neutral with an honest message (FR-011).
- [ ] T025 [US3] Implement check idempotency (find-or-update by repo+headSha) in `packages/github-app/src/checks.ts` (FR-012).
- [ ] T026 [US3] Document the minimum permission set + write-allowlist in `packages/github-app/README.md` for installer verification (FR-010/FR-014, US3).

**Checkpoint**: US3 independently demoable — safety boundary verifiable end-to-end.

---

## Phase 6: Polish & Cross-Cutting

- [ ] T027 [P] Update `README.md` and `packages/cli/README.md` to document the App surface (report-only, self-hostable) — no command behavior change.
- [ ] T028 Run focused package tests: `pnpm --filter @aker-build/github-app test`.
- [ ] T029 Run full suite + typecheck: `pnpm test` and `pnpm typecheck` (must be green).
- [ ] T030 Final status: confirm no forbidden surfaces touched (no mutation code, no persistence, no P5/P6 drift) and `git status` is limited to allowed files.

---

## Dependencies & Story Completion Order

```text
Setup (T001–T003)
  └─ Foundational (T004–T006)   ← blocks all stories
        ├─ US1 (T007–T013)  🎯 MVP — independently shippable
        ├─ US2 (T014–T019)  builds on US1's checks.ts (presentation layer)
        └─ US3 (T020–T026)  builds on US1 runner/checks (safety + degraded paths)
              └─ Polish (T027–T030)
```

- **US1 is the MVP**: opened PR → correct annotation → no other writes. Demoable alone.
- **US2 depends on US1** only because it extends `checks.ts`; conceptually independent test.
- **US3 depends on US1** for the runner/checks surfaces it hardens.

## Parallel Opportunities

- T005 / T006 (safety impl + its test) — different files.
- All `[P]` test tasks within a story (T007–T009, T014–T016, T020–T023) can be authored in parallel before their implementation tasks.
- T003 and T027 (manifest, docs) are independent of logic tasks.

## Implementation Strategy

1. Ship **US1 (MVP)** first — it delivers the entire EXPAND-phase value (findings on the PR).
2. Layer **US2** (readability) and **US3** (safety hardening) incrementally; each is independently testable.
3. TDD throughout: every `[P]` test task lands RED before its GREEN implementation task.
4. Stop and report if any task would require a write beyond the Checks API, persistence of source/secrets, or P5/P6 behavior (plan Stop conditions).
