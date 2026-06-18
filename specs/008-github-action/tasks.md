---

description: "Task list for 008-github-action implementation"
---

# Tasks: GitHub Action

**Input**: Design documents from `/specs/008-github-action/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/action-inputs.md,
contracts/ci-summary.md, quickstart.md

**Tests**: NONE. 008 ships **no new code** (FR-002: reuse the CLI, no separate engine; AC-008: no live
workflow). There is nothing executable to unit-test; validation is **documentation-level** — the example
workflow's chain is checked against the real 007 `review-pr` contract + the existing review e2e, and the
critical-blocking `jq` against `review.json`'s real shape. (Manufacturing a code unit just to have a test
would violate FR-002.)

**Organization**: Tasks grouped by user story. US1 (PR summary) is the MVP; US2 (critical-gate-blocking)
is the additive P2 enforcement layer. Most design artifacts were authored at the plan layer; the
implement phase adds the **one new repo file (ADR-007)** and performs documentation validation.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 (user-story phases only)
- Exact file paths included. **No `packages/*`, no `.github/workflows/*.yml`, no `package.json`/lockfile.**

---

## Phase 1: Setup

**Purpose**: The single new repo artifact — the CI runtime/packaging decision.

- [X] T001 Write **ADR-007** (`docs/decisions/ADR-007-ci-runtime.md`): run the unbuilt TypeScript CLI in
  CI via corepack pnpm + `tsx` (no published binary / no live workflow yet); a packaged composite Action
  / published `tenantguard` binary is a later additive step. Mirrors ADR-002…006 format. (Research R4.)

---

## Phase 2: Foundational (Shared Contract)

**Purpose**: The integration contract both stories depend on — already drafted at the plan layer; this
phase confirms it against the REAL upstream shapes.

**⚠️ CRITICAL**: Both stories consume `review.json`/`review.md`; the contract must match their real shape.

- [X] T002 Verify `contracts/ci-summary.md` against the REAL `review.md` produced by 007 (`packages/review/src/render.ts`): section order (verdict → findings → scope → changed files → verdict line), and that evidence shows `signal` only (no raw secret). Correct the contract if it drifts.
- [X] T003 Verify `contracts/action-inputs.md`'s check-status rule against the REAL `review.json` shape (`packages/review/src/schema.ts`): `findings[].severity` is the field driving critical-blocking; `verdict` ∈ {ready,not_ready,needs_verification}; a Not-Ready verdict exits 0 (007 contract). Correct if it drifts.

**Checkpoint**: The contract matches what 007 actually emits — the example workflow can rely on it.

---

## Phase 3: User Story 1 — See TenantGuard results on a PR (Priority: P1) 🎯 MVP

**Goal**: A `pull_request`-triggered run produces a CI summary (verdict + findings + evidence) from the
existing CLI, with no repo writes.

**Independent Test**: Trace the example workflow over a sample change and confirm the documented summary
(verdict + contributing findings + evidence) is produced, and no commit/push/merge/comment occurs.

### Implementation for User Story 1 (documentation)

- [X] T004 [US1] In `quickstart.md`, finalize the **example workflow**: `pull_request` trigger;
  **checkout PR head** (`github.event.pull_request.head.sha`, `fetch-depth: 0` — load-bearing per R2);
  `scan → review-pr` via `pnpm dlx tsx packages/cli/src/bin.ts`; publish `review.md` to
  `$GITHUB_STEP_SUMMARY` with `if: always()`. (FR-001/002/003.)
- [X] T005 [US1] In the example workflow, set `permissions: contents: read` and include **no** mutating
  step (no commit/push/merge/comment/label/issue) — the read-only guarantee (FR-005, SC-004) made
  explicit in the YAML.
- [X] T006 [US1] Validate the US1 chain against reality: confirm `scan → review-pr` (no separate `gates`
  step) is the minimal correct chain (review-pr runs gates internally) and that omitting the PR-head
  checkout would yield a false "Ready" — cross-check `specs/007-pr-reviewer/contracts/review-cli.md` +
  the 007 e2e. Note the finding in `quickstart.md` (Notes).

**Checkpoint**: US1 done — the documented workflow produces the verdict+findings summary, read-only.
**This is the MVP** (the constitution's CI delivery surface over `review-pr`).

---

## Phase 4: User Story 2 — Block on critical gate failure (Priority: P2)

**Goal**: Optional critical-gate-blocking — a `severity:"critical"` finding fails the check; non-critical
findings are reported without failing.

**Independent Test**: Trace the `jq` enforcement step over a `review.json` with a `severity:"critical"`
finding (check fails) vs one with only `high`/`medium` findings (check passes, findings still reported).

### Implementation for User Story 2 (documentation)

- [X] T007 [US2] In `quickstart.md`, finalize the **critical-gate-blocking** step: gated by a
  `fail-on-critical` input (default off); `jq '[.findings[] | select(.severity=="critical")] | length'`
  over `review.json`; exit 1 (with `::error::`) iff count > 0. Keyed off `severity`, NOT the verdict and
  NOT the exit code. (FR-004, SC-002, SC-003.)
- [X] T008 [US2] Document in `contracts/action-inputs.md` (already drafted) the authoritative check rule:
  error → fail; `fail-on-critical` ∧ ∃ critical → fail; else pass. Confirm it explicitly rejects
  verdict-based and exit-code-based failing (the SC-003 trap). Correct if needed.
- [X] T009 [US2] Add the SC-003 note to `quickstart.md`: a `not_ready` verdict with only non-critical
  findings still **passes** the check (report-only) — the verdict drives the summary, severity drives
  the check.

**Checkpoint**: US1 + US2 done — summary always produced; critical-blocking optional and correct.

---

## Phase 5: Polish & Cross-Cutting

- [X] T010 [P] Verify the **error-vs-verdict** handling in the example: a non-zero CLI step fails the job
  (FR-008, SC-007), while a Not-Ready *verdict* (exit 0) does not by itself fail; the `if: always()`
  summary still renders on failure. Note in `quickstart.md`.
- [X] T011 [P] Walk the **acceptance mapping** table in `quickstart.md` end to end — every SC (SC-001…
  SC-007) maps to a concrete step/line in the example workflow; fix any gap.
- [X] T012 [P] Confirm **no forbidden artifacts** were created: no `.github/workflows/*.yml`, no
  `packages/*` change, no `package.json`/lockfile change (`git status` shows only specs/008 docs +
  `docs/decisions/ADR-007-ci-runtime.md` + the CLAUDE.md marker). (AC-008.)
- [X] T013 Final review: spec ↔ artifacts agree (no stale "scan → gates → review" prose; critical-block
  keyed off severity everywhere); mark all tasks `[X]`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: ADR-007 — no dependency; start immediately.
- **Foundational (Phase 2)**: verify the contract vs real 007 shapes — before the stories rely on it.
- **US1 (Phase 3)**: the MVP summary workflow. Depends on the verified contract.
- **US2 (Phase 4)**: adds the optional enforcement step on top of US1's workflow (same file —
  `quickstart.md` — so sequence US1 → US2 edits).
- **Polish (Phase 5)**: after both stories.

### Within Each User Story

- No code → no RED/GREEN. Each task is an authoring or a documentation-validation step. The validation
  tasks (T002/T003/T006) check the docs against the REAL shipped CLI/contracts — the cross-artifact
  grounding lesson, applied at the documentation layer.

### Parallel Opportunities

- T002/T003 (different contract files) can run in parallel.
- Polish T010/T011/T012 (different concerns) can run in parallel.
- US1 and US2 both edit `quickstart.md`, so sequence them (US1 → US2).

---

## Implementation Strategy

### MVP First (User Story 1 only)

ADR-007 → verify contract → US1 example workflow (checkout → scan → review-pr → summary, read-only).
**STOP & VALIDATE**: the documented workflow produces the verdict+findings summary with no repo writes.
This is the constitution's CI delivery surface over `review-pr`.

### Incremental Delivery

Setup + Foundational → US1 (summary, MVP) → US2 (optional critical-blocking) → Polish. Each adds value
without a live workflow file (AC-008) and without new code (FR-002).

---

## Notes

- 008 ships **documentation + one ADR**, not code. The example workflow is a fenced block in
  `quickstart.md`, never a live `.github/workflows/*.yml`.
- Critical-blocking keys off `review.json` `severity:"critical"` — never the verdict (any risk →
  not_ready) or the exit code (Not-Ready exits 0).
- The PR-head checkout is load-bearing (007 gates inspect the local working tree).
- Unsigned commits authorized this session; never `git add -A`/`git add .`; commit/push/PR only when
  explicitly requested.
