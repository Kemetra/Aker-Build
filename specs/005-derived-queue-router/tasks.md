---
description: "Task list for 005-derived-queue-router implementation"
---

# Tasks: Derived Queue & Router

**Input**: Design documents from `/specs/005-derived-queue-router/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{queue-route-cli,queue-json,route-json}.md
**Tests**: INCLUDED — TDD per the constitution (Development Workflow) and the feature request.

**Organization**: Grouped by the three user stories in `spec.md` (US1 P1 derive queue, US2 P1 route,
US3 P2 lock scope/blast radius), each independently testable. Output is `queue.json` + `route.json`
validated with the queue package's Zod schemas; evidence is imported from `@tenantguard/project-map`.

> **GATE**: Writing this file creates no code. Implementation begins only after `plan.md` + `tasks.md`
> are reviewed. Package/lockfile changes (T002) are gated on explicit approval. The queue/router is
> **strictly read-only on the scanned repo** (FR-011) — every task preserves that.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 (setup/foundational/polish carry no label)
- Paths follow the `packages/queue` + `packages/cli` layout from `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Author `docs/decisions/ADR-004-queue-scoring.md` recording the **transparent weighted-sum** scoring model (resolves the spec's deferred formula), citing `research.md` R1 and the spec's pinned selection ordering. (Docs-only.)
- [x] T002 Initialize `packages/queue/` (`package.json` depending on `@tenantguard/project-map` + `@tenantguard/gates` + `@tenantguard/scanner` workspace deps + `zod`; `tsconfig.json` with `exclude: ["tests/fixtures"]`) and add `queue` + `route` command surfaces to the existing `packages/cli`. **Approved package/lockfile change.**
- [x] T003 [P] Configure Vitest for `packages/queue` (`vitest.config.ts`), reusing the workspace toolchain.

**Checkpoint**: `packages/queue` skeletoned; ADR-004 recorded. No derivation/routing logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 [P] Define the Zod schemas in `packages/queue/src/schema.ts`: `queueItemSchema` (full item contract + `status`/`type` enums), `queueSchema` (`schema_version`, `items[]`), `routeDecisionSchema` (`next` nullable + `blocked[]` + `no_safe_task_reasons[]`), **importing `evidenceSchema` from `@tenantguard/project-map`** (FR-003, FR-014, FR-015; data-model).
- [x] T005 [P] Define types (`QueueItem`, `Queue`, `RouterDecision`, `LockScope`, `ScoreFactors`) in `packages/queue/src/types.ts` per `data-model.md`.
- [x] T006 Implement context construction in `packages/queue/src/context.ts`: load + validate `project-map.json` (002) and `risks.json` (004 `validateRisks`); wire **read-only** scanner io incl. optional local-diff read (FR-011, R2; depends on T005).
- [x] T007 Create synthetic test fixtures (`project-map.json` + `risks.json` pairs) under `packages/queue/tests/fixtures/` yielding a mixed-readiness queue: ready, dep-blocked, lock-overlap, circular-dep (R6).

**Checkpoint**: Schemas + types + context + fixtures ready for all stories.

---

## Phase 3: User Story 1 - Derive a queue from evidence (Priority: P1) 🎯 MVP

**Goal**: `tenantguard queue` produces `queue.json` where every item carries the full contract, each
finding-derived item traces to evidence, and no-safe-action findings become `blocked` items.

**Independent Test**: From a map + risk list, derive the queue and confirm each item has id, status,
type, evidence, dependencies, lock scope, allowed/forbidden files, gates, validation, stop conditions.

### Tests for User Story 1 (write FIRST; must FAIL) ⚠️

- [x] T008 [P] [US1] Derive-contract test: every item carries the full contract + valid `status`/`type` enums; queue validates against `queueSchema` (SC-001), in `packages/queue/tests/derive-contract.test.ts`.
- [x] T009 [P] [US1] Evidence-trace test: every finding-derived item has ≥1 `source.evidence` tracing to the finding (SC-002), in `packages/queue/tests/evidence-trace.test.ts`.
- [x] T010 [P] [US1] Blocked-derivation test: a `needs_verification` finding (no safe scoped action) becomes a `blocked` item, not `ready` (US1 #3), in `packages/queue/tests/blocked-derivation.test.ts`.
- [x] T011 [P] [US1] Secret-safety test: no secret value appears in `queue.json` (SC-007), in `packages/queue/tests/secrets.test.ts`.

### Implementation for User Story 1

- [x] T012 [US1] Implement derivation (findings + map → queue items: type from gate, priority/risk from severity, scope/allowed/forbidden from evidence paths, gates/validation/stop/final_report defaults) in `packages/queue/src/derive.ts` per `data-model.md` (depends on T006).
- [x] T013 [US1] Implement dependency graph + **circular-dependency detection** in `packages/queue/src/deps.ts` (FR-010, R5; depends on T005).
- [x] T014 [US1] **Validate the produced queue with `queueSchema` before returning/writing**; on failure, error and emit nothing (depends on T004, T012).
- [x] T015 [US1] Implement output write (`queue.json` to designated `--out`, default `./.tenantguard/`, outside scanned tracked source) in `packages/queue/src/io.ts` (FR-016; delegates reads to scanner io; depends on T014).
- [x] T016 [US1] Public surface `deriveQueue(opts): Queue` in `packages/queue/src/index.ts` (depends on T014).

**Checkpoint**: MVP — a map + risks produce an evidence-traced, contract-complete, secret-safe queue.

---

## Phase 4: User Story 2 - Route to one next safest task (Priority: P1)

**Goal**: `tenantguard route` returns exactly one next-safest item with an explicit reason, a blocked
list with reasons, or an explicit "no safe task" — never an arbitrary pick.

**Independent Test**: From a mixed-readiness queue, route and confirm exactly one next + reason; blocked
items listed with reasons; an all-blocked queue yields `next: null` + `no_safe_task_reasons[]`.

### Tests for User Story 2 (write FIRST; must FAIL) ⚠️

- [x] T017 [P] [US2] Route-one test: exactly one `next` with `reason[]`; blocked items each have a reason (SC-003, SC-004), in `packages/queue/tests/route-one.test.ts`.
- [x] T018 [P] [US2] No-safe-task test: an all-blocked queue yields `next: null` + non-empty `no_safe_task_reasons[]`, never an arbitrary pick (FR-007), in `packages/queue/tests/no-safe-task.test.ts`.
- [x] T019 [P] [US2] Circular-deps routing test: a circular dependency is reported (item blocked with a "circular dependency" reason), routing does not loop (SC-006), in `packages/queue/tests/circular-deps.test.ts`.

### Implementation for User Story 2

- [x] T020 [US2] Implement the weighted-sum scorer over the spec factors in `packages/queue/src/score.ts`; record each factor's contribution for the reason output (ADR-004, FR-005; pure/testable; depends on T005).
- [x] T021 [US2] Implement routing in `packages/queue/src/route.ts`: select one `next` (primary `score desc`; ties `blast_radius asc` → `risk asc` → `id asc`, code-unit id compare); build `blocked[]` with reasons; `no_safe_task_reasons[]` when none safe; validate against `routeDecisionSchema` (FR-004/006/007/009; depends on T013, T020, T004).
- [x] T022 [US2] Public surface `route(opts): RouterDecision` + `route.json` write in `packages/queue/src/index.ts` / `io.ts` (depends on T021, T015).

**Checkpoint**: Router returns one justified task (or explicit none); US1 + US2 pass independently.

---

## Phase 5: User Story 3 - Respect lock scopes and blast radius (Priority: P2)

**Goal**: The router deprioritizes/blocks items whose lock scopes overlap in-flight work (current diff)
or whose blast radius is large relative to safer alternatives.

**Independent Test**: With a current diff overlapping one item's lock scope, route and confirm the
overlapping item is deprioritized/blocked in favor of a non-overlapping safer item.

### Tests for User Story 3 (write FIRST; must FAIL) ⚠️

- [x] T023 [P] [US3] Lock-overlap test: an item whose lock scope intersects the current diff is deprioritized/blocked vs a non-overlapping item (US3), in `packages/queue/tests/lock-overlap.test.ts`.
- [x] T024 [P] [US3] Determinism test: two routing runs over unchanged input produce the same decision (pinned ordering), excluding non-deterministic metadata (SC-005), in `packages/queue/tests/determinism.test.ts`.

### Implementation for User Story 3

- [x] T025 [US3] Implement lock-scope overlap detection (item↔item and item↔current-diff) feeding the `lock overlap` + `blast radius` scoring factors in `packages/queue/src/score.ts` / `route.ts` (FR-008; depends on T020, T021).
- [x] T026 [US3] Enforce deterministic ordering + code-unit `id` comparison and exclude clocks from the compared `queue.json`/`route.json` surface (R4; depends on T021).

**Checkpoint**: Lock-scope/blast-radius safety honored; all three stories pass independently.

---

## Phase 6: CLI (`tenantguard queue` / `route`)

**Goal**: Wire the queue library into the `tenantguard` CLI per `contracts/queue-route-cli.md`.

### Tests (write FIRST; must FAIL) ⚠️

- [x] T027 [P] CLI test: `queue [path] --out <dir>` produces a valid `queue.json`, exits 0; missing `risks.json` exits 1 ("run gates first"); `route` produces `route.json` + prints the decision, exits 0; missing `queue.json` exits 1 ("run queue first"); scanned repo unchanged, in `packages/cli/tests/cli.queue-route.test.ts`.

### Implementation

- [x] T028 [US1] Implement the `queue` command (`[path]`, `--out`, `--stdout`) in `packages/cli/src/commands/queue.ts` and register it in `packages/cli/src/index.ts` (depends on T016).
- [x] T029 [US2] Implement the `route` command (`[path]`, `--out`, `--stdout`; prints the decision summary) in `packages/cli/src/commands/route.ts` and register it (depends on T022).

---

## Phase 7: Polish & Cross-Cutting

- [x] T030 [P] Verify local-first: no network client or credential read anywhere in `packages/queue` (SC-007).
- [x] T031 [P] Verify domain-neutral: no Retail Tower / ERPNext / POS strings or rules (FR-013).
- [x] T032 Run `pnpm -r test` + `pnpm -r typecheck`; confirm `packages/queue` + `packages/cli` green and the empty-queue / all-blocked edge cases hold.

---

## Dependencies (story completion order)

```text
Setup (T001–T003)
  └─ Foundational (T004–T007)   ← blocks all stories
       ├─ US1 (T008–T016)  🎯 MVP — derive queue (independently testable)
       ├─ US2 (T017–T022)  — route; needs deps (T013) + scorer (T020)
       └─ US3 (T023–T026)  — lock scope/blast radius; needs route.ts (T021)
  └─ CLI (T027–T029)  — depends on US1 (T016) + US2 (T022)
  └─ Polish (T030–T032)
```

## Parallel Example: User Story 1

```bash
# Write US1 tests first (must FAIL):
Task: "Derive-contract test in packages/queue/tests/derive-contract.test.ts"
Task: "Evidence-trace test in packages/queue/tests/evidence-trace.test.ts"
Task: "Blocked-derivation test in packages/queue/tests/blocked-derivation.test.ts"
Task: "Secret-safety test in packages/queue/tests/secrets.test.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Setup (ADR-004 + approved package init).
2. Foundational (schemas + types + context + fixtures).
3. US1 (derive an evidence-traced, contract-complete, secret-safe queue).
4. **STOP & VALIDATE**: derive over the mixed-readiness fixture; confirm full contract + evidence trace.

### Incremental Delivery

US1 (derive queue) → US2 (route one task, explicit reasons, no-safe-task, circular deps) → US3
(lock-scope/blast-radius safety + determinism) → CLI → polish. Commit after each task or logical group,
on the approved branch, only when requested.

---

## Notes

- **No code is written by generating this file.** Implementation waits on plan+tasks review.
- TDD: verify each test fails before implementing.
- Queue/router is **read-only on the scanned repo** — output goes to a designated path outside tracked source.
- Output **must validate against the queue `schemas`** before being written; the evidence shape is **imported** from `@tenantguard/project-map` (never redefined).
- [P] = different files, no dependency; [US#] maps task → user story.
