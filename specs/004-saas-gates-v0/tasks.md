---
description: "Task list for 004-saas-gates-v0 implementation"
---

# Tasks: SaaS Gates v0

**Input**: Design documents from `/specs/004-saas-gates-v0/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/gates-cli.md, contracts/risks-json.md
**Tests**: INCLUDED — TDD per the constitution (Development Workflow) and the feature request.

**Organization**: Grouped by the three user stories in `spec.md` (US1 P1 risk list, US2 P2 triage,
US3 P3 subset), each independently testable. Output is a `risks.json` validated with the gates
`risksSchema`, whose evidence shape is imported from `@tenantguard/project-map` (002).

> **GATE**: Writing this file creates no code. Implementation begins only after `plan.md` + `tasks.md`
> are reviewed. Package/lockfile changes (T002) are gated on explicit approval. The gate runner is
> **strictly read-only on the scanned repo** (FR-008) — every task preserves that.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 (setup/foundational/polish carry no label)
- Paths follow the `packages/gates` + `packages/cli` layout from `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Author `docs/decisions/ADR-003-gate-rule-engine.md` recording **TypeScript-coded gate functions** (no YAML/Rego engine) as the v0 rule-engine approach, citing `research.md` R1 and the constitution's OPA-deferred posture. (Docs-only.)
- [x] T002 Initialize `packages/gates/` (`package.json` depending on `@tenantguard/project-map` + `@tenantguard/scanner` workspace deps + `zod`; `tsconfig.json`) and add a `gates` command surface to the existing `packages/cli` (`commander` already present). **Approved package/lockfile change.**
- [x] T003 [P] Configure Vitest for `packages/gates` (`vitest.config.ts`), reusing the workspace toolchain.

**Checkpoint**: `packages/gates` skeletoned; ADR-003 recorded. No gate logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 [P] Define the `risks.json` Zod schema in `packages/gates/src/schema.ts`: `findingSchema = z.discriminatedUnion("status", [...])` (risk → severity enum + ≥1 evidence; needs_verification → severity null + ≥1 evidence; not_applicable → severity null + ≥0 evidence), **importing `evidenceSchema` from `@tenantguard/project-map`** (FR-003); `risksSchema = { schema_version, findings: Finding[] }` (R3, R4, data-model).
- [x] T005 [P] Define gate types (`Gate`, `GateContext`, `Finding`, `Severity`) in `packages/gates/src/types.ts` per `data-model.md`.
- [x] T006 Implement `GateContext` construction in `packages/gates/src/context.ts`: load + `validate()` `project-map.json` via `@tenantguard/project-map`; wire **read-only** `listFiles`/`fileExists`/`readFileSafe` reused from `@tenantguard/scanner` io (FR-008, R2; depends on T005).
- [x] T007 Implement the gate registry + subset selection by id in `packages/gates/src/registry.ts` (filter by `--gates` ids; unknown id → error) (FR-006, R7; depends on T005).
- [x] T008 Create the v0 sample-set fixtures under `packages/gates/tests/fixtures/` (per-gate clean + violation repos) and reuse the 003 fixture-prep helper (copy-to-tempdir + `git init`, cached) (SC-003, R6).

**Checkpoint**: Schema + types + context + registry + fixtures ready for all stories.

---

## Phase 3: User Story 1 - Get an evidence-backed risk list (Priority: P1) 🎯 MVP

**Goal**: `tenantguard gates` over a scanned repo produces `risks.json` where every finding cites a
gate id + status, every `risk` finding cites severity + ≥1 evidence object, and the scanned repo is
unchanged.

**Independent Test**: Run gates over a per-gate violation fixture → a finding appears tied to the right
gate with evidence at the offending location; assert 0 scanned files changed.

### Tests for User Story 1 (write FIRST; must FAIL before implementation) ⚠️

- [x] T009 [P] [US1] Findings-shape test: every finding cites `gate_id`+`status`; every `status: risk` finding cites severity + ≥1 evidence object (SC-002), in `packages/gates/tests/findings-shape.test.ts`.
- [x] T010 [P] [US1] Known-violation test: a per-gate violation fixture yields a `risk` finding tied to the correct gate with evidence pointing at the offending location (SC-001), in `packages/gates/tests/known-violation.test.ts`.
- [x] T011 [P] [US1] Read-only test: snapshot fixture file state before+after a run; assert 0 created/modified/deleted (FR-008), in `packages/gates/tests/readonly.test.ts`.
- [x] T012 [P] [US1] Secret-safety test: secret-like content is flagged as a finding (evidence `signal` names the pattern); the secret value never appears in `risks.json` or stdout (SC-006, FR-009), in `packages/gates/tests/secrets.test.ts`.

### Implementation for User Story 1

- [x] T013 [P] [US1] Implement the security/tenant-isolation gate (TG-G4) in `packages/gates/src/gates/g4-security.ts` (auth-guard / tenant-filter / role-guard / tenant_id / secret-in-logs signals) per `data-model.md` (depends on T006).
- [x] T014 [P] [US1] Implement the architecture-boundary gate (TG-G1) in `packages/gates/src/gates/g1-architecture.ts` (frontend→backend internals, worker HTTP, UI→DB signals) (depends on T006).
- [x] T015 [P] [US1] Implement the idempotency gate (TG-G5) in `packages/gates/src/gates/g5-idempotency.ts` (webhook/job/payment dedupe signals) (depends on T006).
- [x] T016 [P] [US1] Implement the source-truth gate (TG-G0) in `packages/gates/src/gates/g0-source-truth.ts` (missing source/spec/CI evidence signals) (depends on T006).
- [x] T017 [US1] Implement the run orchestrator in `packages/gates/src/run.ts`: select gates → run each → collect a single unified `findings[]` with **deterministic stable sort** (depends on T007, T013–T016).
- [x] T018 [US1] **Validate the produced risks.json with `risksSchema` before returning/writing**; on failure, error and emit nothing (R3; depends on T004, T017).
- [x] T019 [US1] Implement output write (`risks.json` to designated `--out`, default `./.tenantguard/`, outside scanned tracked source) in `packages/gates/src/io.ts` (FR-014; delegates reads to scanner io; depends on T018).
- [x] T020 [US1] Public surface `runGates(opts): RisksResult` in `packages/gates/src/index.ts` (depends on T018).

**Checkpoint**: MVP — a scanned repo produces an evidence-backed, read-only, secret-safe risk list.

---

## Phase 4: User Story 2 - Understand and prioritize risks (Priority: P2)

**Goal**: Each finding is classifiable by gate and status without reading code; `risk` findings carry a
severity; insufficient-evidence and inapplicable cases are honestly represented.

**Independent Test**: Produce a risk list spanning several gates + a not-applicable + a
needs-verification case → confirm each finding is classifiable by gate/status (and risk findings by
severity) from the JSON alone.

### Tests for User Story 2 (write FIRST; must FAIL before implementation) ⚠️

- [x] T021 [P] [US2] Needs-verification test: a gate with insufficient evidence emits `status: needs_verification` (severity null, ≥1 evidence describing what was inspected), never a fabricated pass/fail (SC-004), in `packages/gates/tests/needs-verification.test.ts`.
- [x] T022 [P] [US2] Not-applicable test: an inapplicable gate (e.g. no billing surface) emits `status: not_applicable` with severity null, not a failure (FR-005), in `packages/gates/tests/not-applicable.test.ts`.
- [x] T023 [P] [US2] Clean-no-false-positive test: a per-gate clean fixture yields 0 `risk` findings for that gate (SC-003), in `packages/gates/tests/clean-no-fp.test.ts`.

### Implementation for User Story 2

- [x] T024 [P] [US2] Implement the contract/API gate (TG-G2) in `packages/gates/src/gates/g2-contract.ts` — emits `needs_verification` when no diff evidence is available (FR-004; depends on T006).
- [x] T025 [P] [US2] Implement the migration-safety gate (TG-G3) in `packages/gates/src/gates/g3-migration.ts` (depends on T006).
- [x] T026 [P] [US2] Implement the billing/usage gate (TG-G6) in `packages/gates/src/gates/g6-billing.ts` — emits `not_applicable` when no billing surface is detected (FR-005; depends on T006).
- [x] T027 [P] [US2] Implement the observability gate (TG-G7) in `packages/gates/src/gates/g7-observability.ts` (depends on T006).
- [x] T028 [P] [US2] Implement the dependency/upgrade gate (TG-G8) in `packages/gates/src/gates/g8-dependency.ts` (depends on T006).
- [x] T029 [US2] Implement the release-readiness gate (TG-G9) in `packages/gates/src/gates/g9-release.ts` (aggregates critical-gate/CI/rollback signals; depends on T006, T017).

**Checkpoint**: All ten v0 gates implemented; the three statuses are honestly represented; US1 + US2 pass independently.

---

## Phase 5: User Story 3 - Run a subset of gates (Priority: P3)

**Goal**: Running only named gate ids yields just those findings; runs are deterministic.

**Independent Test**: Run `--gates TG-G4,TG-G5` → only TG-G4/TG-G5 findings appear; run twice over
unchanged input → equivalent risk lists.

### Tests for User Story 3 (write FIRST; must FAIL before implementation) ⚠️

- [x] T030 [P] [US3] Subset test: `--gates TG-G4,TG-G5` runs only the named gates; an unknown id errors clearly (FR-006), in `packages/gates/tests/subset.test.ts`.
- [x] T031 [P] [US3] Determinism test: two runs over unchanged input produce equivalent risk lists (stable ordering), excluding any non-deterministic metadata (SC-005), in `packages/gates/tests/determinism.test.ts`.

### Implementation for User Story 3

- [x] T032 [US3] Enforce stable sorting of `findings[]` (by `gate_id`, then first evidence `path`, then `signal`) and exclude clocks from the compared risks.json surface in `packages/gates/src/run.ts` (R5; depends on T017).

**Checkpoint**: Subset selection + determinism verified; all three stories pass independently.

---

## Phase 6: CLI (`tenantguard gates`)

**Goal**: Wire the gates library into the `tenantguard` CLI per `contracts/gates-cli.md`.

### Tests (write FIRST; must FAIL) ⚠️

- [x] T033 [P] CLI gates test: `gates [path] --out <dir>` produces a valid `risks.json`, exits 0; missing `project-map.json` exits 1 with a "run scan first" message; unknown `--gates` id exits 2; scanned repo unchanged, in `packages/cli/tests/cli.gates.test.ts`.

### Implementation

- [x] T034 [US1] Implement the `gates` command (`[path]`, `--gates`, `--out`, `--stdout`) in `packages/cli/src/commands/gates.ts` and register it in `packages/cli/src/index.ts` (depends on T020).

---

## Phase 7: Polish & Cross-Cutting

- [x] T035 [P] Verify local-first: no network client or credential read anywhere in `packages/gates` (SC-007) — assert via a no-network test or code review note.
- [x] T036 [P] Verify domain-neutral: no Retail Tower / ERPNext / POS strings or rules in any gate (FR-011).
- [x] T037 Run `pnpm -r test` + `pnpm -r typecheck`; confirm `packages/gates` + `packages/cli` green and the empty-repo edge case (0 risk findings, ≤1 marker per gate) holds.

---

## Dependencies (story completion order)

```text
Setup (T001–T003)
  └─ Foundational (T004–T008)   ← blocks all stories
       ├─ US1 (T009–T020)  🎯 MVP — independently testable
       ├─ US2 (T021–T029)  — depends on Foundational; G9 (T029) also needs run.ts (T017)
       └─ US3 (T030–T032)  — depends on registry (T007) + run.ts (T017)
  └─ CLI (T033–T034)  — depends on US1 public surface (T020)
  └─ Polish (T035–T037)
```

## Parallel Example: User Story 1

```bash
# Write US1 tests first (must FAIL):
Task: "Findings-shape test in packages/gates/tests/findings-shape.test.ts"
Task: "Known-violation test in packages/gates/tests/known-violation.test.ts"
Task: "Read-only test in packages/gates/tests/readonly.test.ts"
Task: "Secret-safety test in packages/gates/tests/secrets.test.ts"

# Then implement gates in parallel (different files):
Task: "TG-G4 in packages/gates/src/gates/g4-security.ts"
Task: "TG-G1 in packages/gates/src/gates/g1-architecture.ts"
Task: "TG-G5 in packages/gates/src/gates/g5-idempotency.ts"
Task: "TG-G0 in packages/gates/src/gates/g0-source-truth.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Setup (ADR-003 + approved package init).
2. Foundational (schema + types + context + registry + fixtures).
3. US1 (run gates → evidence-backed, read-only, secret-safe risks.json for the P1 gates).
4. **STOP & VALIDATE**: run gates over a violation fixture; confirm finding tied to right gate + evidence, repo unchanged.

### Incremental Delivery

US1 (evidence-backed risk list) → US2 (honest triage: all 10 gates + needs_verification/not_applicable)
→ US3 (subset + determinism) → CLI → polish. Commit after each task or logical group, on the approved
branch, only when requested.

---

## Notes

- **No code is written by generating this file.** Implementation waits on plan+tasks review.
- TDD: verify each test fails before implementing.
- Gate runner is **read-only on the scanned repo** — output goes to a designated path outside tracked source.
- Output **must validate against the gates `risksSchema`** before being written; the evidence shape is **imported** from `@tenantguard/project-map` (never redefined).
- [P] = different files, no dependency; [US#] maps task → user story.
