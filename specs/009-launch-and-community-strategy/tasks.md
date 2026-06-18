---

description: "Task list for 009-launch-and-community-strategy"
---

# Tasks: Launch & Community Strategy

**Input**: Design documents from `/specs/009-launch-and-community-strategy/`
**Prerequisites**: plan.md, spec.md (no research/data-model/contracts — none exist by design for a
spec-is-the-deliverable feature)

**Tests**: NONE. 009 has **no executable artifact** — the deliverable IS `spec.md` (Required Output;
SC-006 / FR-009 / AC-010 forbid any other artifact). There is no code, interface, or data to test.
"Tasks" here are **review-and-verify** steps that confirm the spec satisfies each AC/SC and that the
no-vaporware claim holds against now-merged code.

**Organization**: Grouped by the spec's three user stories. Because the spec already exists and already
satisfies its ACs, every task is a verification (and, where a claim was aspirational when written, a
small refinement to `spec.md` flipping it to verified). The implement phase produces **nothing beyond
`spec.md`** + the spec-kit process files.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (independent checks)
- **[Story]**: US1 / US2 / US3 (user-story phases only)
- **No `packages/*`, no `.github/workflows/*`, no `package.json`/lockfile, no ADR, no assets.**

---

## Phase 1: Setup

**Purpose**: Confirm the deliverable exists and the feature's hard boundary.

- [ ] T001 Confirm `specs/009-launch-and-community-strategy/spec.md` is present and is the sole binding
  deliverable (Required Output); note that no other artifact may be created (SC-006 / FR-009 / AC-010).

---

## Phase 2: Foundational (No-Vaporware Grounding)

**Purpose**: The one substantive check — every content theme must map to a SHIPPED capability (SC-002 /
FR-005). This was aspirational when the stub was written; 004/006/007 are now merged.

**⚠️ CRITICAL**: If any theme does not map to merged code, the spec overclaims and must be corrected.

- [ ] T002 Verify each content theme in `spec.md` § Content Plan maps to merged code, and record the
  mapping in `spec.md` (flip "aspirational" → "verified"): PR safety → `packages/review/src/verdict.ts`
  (007); tenant isolation TG-G4 → `packages/gates/src/gates/g4-security.ts` (004); architecture gates
  TG-G1/G2 → `g1-architecture.ts` + `g2-contract.ts` (004); prompt boundaries → `packages/prompt/src/
  scope.ts` + `defaults.ts` (006); unscoped agents → conceptual. (SC-002, FR-005.)

**Checkpoint**: Zero vaporware — the launch markets only shipped capability.

---

## Phase 3: User Story 1 — Execute a credible launch from a prepared plan (P1) 🎯 MVP

**Goal**: A maintainer can derive a complete launch-readiness status from the spec alone, with the launch
hard-gated on the reviewed CLI MVP.

**Independent Test**: Hand the spec to someone unfamiliar; they produce a readiness status (each item
done / in-progress / N/A-with-reason) without asking the author.

### Verification for User Story 1

- [ ] T003 [US1] Verify `spec.md` § GitHub Repo Readiness Checklist + § Pre-Launch Checklist: every item
  is individually checkable (done / not-done / N/A-with-reason) with a place for evidence (SC-001, FR-002,
  AC-002).
- [ ] T004 [US1] Verify the **HARD GATE** is explicit: the pre-launch checklist forbids launching before
  the CLI MVP (003–007) is implemented AND reviewed (SC-003, FR-003, AC-003). Confirm it currently
  evaluates to "not ready to launch" (MVP shipped on `main`, but the launch itself is unexecuted).
- [ ] T005 [US1] Verify the readiness/pre-launch sequencing: no channel is posted to before its
  prerequisite readiness items pass (User Story 1 acceptance scenario 2).

**Checkpoint**: US1 done — the spec yields an unambiguous, gated launch-readiness status. **This is the MVP**
(a prepared, reviewable launch plan).

---

## Phase 4: User Story 2 — A first-time visitor understands and tries it in minutes (P2)

**Goal**: The plan ensures a newcomer can grasp the value and reach a real CLI output quickly.

**Independent Test**: A new visitor, given only the (future) public repo per this plan, can run the
documented demo and produce a real CLI output without help.

### Verification for User Story 2

- [ ] T006 [US2] Verify § Core Marketing Message is single + consistent + aligned with `001` and does NOT
  overclaim deferred features (App/dashboard/auto-fix) as available (FR-001, AC-001, Non-Goals).
- [ ] T007 [US2] Verify the readiness checklist requires a runnable quickstart + a terminal GIF/screenshot
  of a real run, and that the activation path (map/risks/queue/prompt/report) is named (User Story 2
  acceptance scenarios; SC-004 activation metric).

**Checkpoint**: US1 + US2 — attention is designed to convert into activation, honestly.

---

## Phase 5: User Story 3 — A contributor finds a clear way in (P3)

**Goal**: The plan ensures a contributor on-ramp (CONTRIBUTING, good first issues) exists in the
readiness checklist.

**Independent Test**: A contributor can, from the repo per this plan, identify setup, what to work on,
and PR expectations without a maintainer explaining.

### Verification for User Story 3

- [ ] T008 [US3] Verify the readiness checklist includes `CONTRIBUTING.md` (setup/workflow/PR
  expectations/CoC pointer) and labeled "good first issues" (User Story 3; durability metric =
  contributors, SC-004).

**Checkpoint**: All three stories' prerequisites are present in the plan.

---

## Phase 6: Polish & Cross-Cutting (Guardrail Verification)

- [ ] T009 [P] Verify § Non-Goals forbids the prohibited tactics as **non-permitted** anywhere in the
  plan: no fake stars, no bought engagement, no paid ads (MVP), no enterprise sales motion, no
  dashboard launch before CLI value (SC-005, FR-008, AC-008).
- [ ] T010 [P] Verify success metrics weight **activation + real usage** over vanity, and launch stages
  (100 / 500 / 1000+) are defined with usage-based gates (SC-004, FR-007, AC-007).
- [ ] T011 [P] Verify growth loops are opt-in/honest and any later-wave loop (CI footer ← 008) is marked
  not-launch-day (FR-006, AC-006).
- [ ] T012 [P] Verify dependencies: depends on `001`, blocks no CLI work, informs later README/demo/
  community (SC-007, FR-010, AC-009); and FR-011/AC-011 (no secrets) + FR-012/AC-011 (domain-neutral).
- [ ] T013 **No-forbidden-artifacts tripwire**: `git status` shows ONLY `specs/009/*` (spec/plan/tasks)
  + the `CLAUDE.md` marker + `.specify/feature.json` — NO `packages/*`, no `.github/workflows/*`, no
  `package.json`/lockfile, no ADR, no marketing-site/dashboard/App files (SC-006, FR-009, AC-010).
- [ ] T014 Final review: every AC (AC-001…AC-011) and SC (SC-001…SC-007) is satisfied by `spec.md`; mark
  all tasks `[X]`.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: confirm the deliverable + the boundary.
- **Foundational (Phase 2)**: the no-vaporware grounding (the one substantive, code-touching check).
- **US1 (Phase 3)**: the readiness/gate verification — the MVP (a usable, gated launch plan).
- **US2 (Phase 4)** / **US3 (Phase 5)**: activation + contributor on-ramp verification; independent of
  each other.
- **Polish (Phase 6)**: guardrail + tripwire + final AC/SC sweep.

### Within Each Story

- No code → no RED/GREEN. Each task is a documentation-verification (read the spec section, confirm it
  satisfies the cited AC/SC; correct the spec only if it drifts). T002 is the lone task that touches
  reality (merged code) and may edit `spec.md` to record the verified mapping.

### Parallel Opportunities

- Phase 6 checks (T009–T012) are independent → parallel.
- US2 and US3 verification are independent → parallel.

---

## Implementation Strategy

### MVP First (User Story 1)

Confirm the deliverable (T001) → ground the no-vaporware claim (T002) → verify the readiness checklists +
hard gate (US1). **STOP & VALIDATE**: an unfamiliar reader can produce a gated launch-readiness status
from the spec alone. That is the MVP — a prepared, reviewable launch plan.

### Incremental Delivery

Setup + Foundational → US1 (gated readiness) → US2 (activation) → US3 (contributors) → Polish
(guardrails + tripwire). Each phase adds verification confidence; none adds an artifact beyond `spec.md`.

---

## Notes

- 009 ships **only `spec.md`** (+ spec-kit process files). No code, no ADR, no assets — the launch plan
  is the deliverable; executing it (posts, GIF, example repo, badge) is later, separately-scoped work.
- The one place this feature touches reality is T002 (content-theme → merged-code mapping) — 009's analog
  of the cross-artifact grounding that mattered in 004–008.
- Unsigned commits authorized this session; never `git add -A`/`git add .`; commit/push/PR only when
  explicitly requested.
