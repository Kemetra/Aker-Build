---
description: "Task list for 002-project-map-schema implementation"
---

# Tasks: Project Map Schema

**Input**: Design documents from `/specs/002-project-map-schema/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/
**Tests**: INCLUDED — TDD is mandated by the constitution (Development Workflow) and the feature request.

**Organization**: Grouped by the three user stories in `spec.md` (US1 P1, US2 P2, US3 P3), each
independently testable.

> **GATE — read before executing any task below**: These tasks are the *plan for implementation*;
> writing this file creates no code. Per the TenantGuard constitution, **implementation (Phase 1+
> below) MUST NOT begin until `plan.md` + `tasks.md` are reviewed and approved**, and only on an
> approved feature branch with explicit instruction. **ADR-001-tech-stack is PENDING** (file absent);
> T001 authors it from the blueprint + spec Assumptions before any package code is written. No
> `package.json`/lockfile/Action is created until T002–T003 are explicitly approved.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 (setup, foundational, polish carry no story label)
- Paths follow the `packages/project-map/` layout decided in `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Record the tech decision and stand up the package skeleton. Each of T002–T003 changes
dependency/lockfile state and is therefore an **explicit-approval gate** (Constitution: lockfiles
MUST NOT change unless package changes are explicitly approved).

- [x] T001 Author `docs/decisions/ADR-001-tech-stack.md` capturing TypeScript / Node LTS / pnpm / Vitest / Zod / JSON+YAML, citing `docs/tenantguard_project_blueprint.md` (tech-stack table, "Why TypeScript first") and `specs/002-project-map-schema/spec.md` Assumptions as the decision basis. (Docs-only; unblocks the Implementation Boundary.) ✅ Done 2026-06-18 — `docs/decisions/ADR-001-tech-stack.md`.
- [x] T002 Initialize the `packages/project-map/` package (`package.json` with Zod + a YAML parser, `tsconfig.json`) per ADR-001. **Requires explicit approval (adds dependencies + lockfile).**
- [x] T003 [P] Configure Vitest + lint/format for `packages/project-map/` (`vitest.config.ts`, lint config). **Requires explicit approval if it touches the lockfile.**

**Checkpoint**: Package skeleton exists; ADR-001 recorded. No schema logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The shared building blocks every user story needs — types and the public surface stub.

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 [P] Define `SCHEMA_VERSION = 1` and the shared **Evidence Object** Zod schema (`{type, path, line, signal, confidence}`; `line`/`path` nullable, `confidence` enum) in `packages/project-map/src/schema.ts`, exactly matching `contracts/project-map.schema.json` `$defs.evidence` and `data-model.md`.
- [x] T005 Stub the public surface (`schema`, `validate`, inferred types, `SCHEMA_VERSION`) in `packages/project-map/src/index.ts` so consumers (003–007) have a stable import target.

**Checkpoint**: Evidence Object + version constant + public surface available for all stories.

---

## Phase 3: User Story 1 - Produce a canonical map of a repo (Priority: P1) 🎯 MVP

**Goal**: A conforming `project-map.json` validates; a map missing a required field is rejected with
a field-level error. The full schema (top-level fields, `tenant_model` honesty rule) + validator.

**Independent Test**: Validate `contracts/example-map.saas.yaml` → passes; remove `tenant_model` →
fails naming `tenant_model`; set `status: not_detected` with `strategy: separate_db` → fails naming
`tenant_model.strategy`.

### Tests for User Story 1 (write FIRST; must FAIL before implementation) ⚠️

- [x] T006 [P] [US1] Accept test: conforming SaaS + non-SaaS maps validate, AND a **multi-repo** map (≥2 entries in `repos[]`, e.g. backend+frontend+worker) validates, in `packages/project-map/tests/schema.accept.test.ts` (loads both `contracts/example-map.*.yaml`; the SaaS example already has 3 repos — FR-002).
- [x] T007 [P] [US1] Reject test: missing each required top-level field → `ok:false` with an error naming that field path, in `packages/project-map/tests/schema.reject.test.ts` (SC-002). Also assert FR-003: `detected_stack` with empty/`null` fields (`runtime: null`, `frameworks: []`) is **accepted** (present-but-empty, not fabricated), while a map **missing** `detected_stack` entirely is **rejected** naming `project.detected_stack`.
- [x] T008 [P] [US1] Tenant-model test: `status` enum honored; `strategy`/`tenant_key` MUST be null/unknown when `status != detected`; guessed value → field-level error, in `packages/project-map/tests/tenant-model.test.ts` (FR-004a).
- [x] T009 [P] [US1] Evidence test: Evidence Object shape; nullable `line`/`path`; `confidence` on the evidence object, in `packages/project-map/tests/evidence.test.ts` (FR-004b).
- [x] T010 [P] [US1] Secret-safety test: a map/evidence carrying a secret-like value is rejected or has no field to hold it; `signal`/`path` never contain the secret, in `packages/project-map/tests/secret-safety.test.ts` (FR-011).

### Implementation for User Story 1

- [x] T011 [US1] Implement the full Project Map Zod schema (version, project+detected_stack, repos[], boundaries[], tenant_model, critical_surfaces, optional metadata) in `packages/project-map/src/schema.ts`, matching `data-model.md` (depends on T004).
- [x] T012 [US1] Implement the conditional **tenant-model honesty invariant** (`status != detected ⇒ strategy ∈ {null,"unknown"} ∧ tenant_key == null`) via `superRefine` in `packages/project-map/src/schema.ts` (depends on T011).
- [x] T013 [US1] Implement `validate(map): { ok, errors: Array<{ path, message }> }` mapping Zod issues to field-paths in `packages/project-map/src/validate.ts` (FR-008; depends on T011).
- [x] T014 [US1] Implement JSON load/parse (canonical) in `packages/project-map/src/io.ts`; no network, no credentials (FR-010; depends on T013).
- [x] T015 [US1] Wire `schema`, `validate`, types, `SCHEMA_VERSION` into `packages/project-map/src/index.ts` (depends on T013).

**Checkpoint**: MVP — a Project Map can be validated with field-level errors and the honesty rule. US1 testable independently.

---

## Phase 4: User Story 2 - Evolve the schema without breaking consumers (Priority: P2)

**Goal**: Additive version bumps keep old maps valid; unknown extra fields are tolerated, never a
hard crash.

**Independent Test**: An older conforming map validates after an additive bump; a map with an
unknown extra field validates (ignored/warned), per SC-003/SC-004.

### Tests for User Story 2 (write FIRST; must FAIL before implementation) ⚠️

- [x] T016 [P] [US2] Compat test: additive change keeps previously-conforming maps valid; unknown extra field → `ok:true` (ignored or warning, never crash), in `packages/project-map/tests/compat.test.ts` (FR-006, FR-007).

### Implementation for User Story 2

- [x] T017 [US2] Implement tolerant read (passthrough of unknown fields; optional warning channel) in `packages/project-map/src/schema.ts` / `validate.ts` (depends on T013).
- [x] T018 [US2] Document the versioning & compatibility policy (additive = compatible; removal/rename/redefine = major bump) in `packages/project-map/README.md` and link it from `research.md` R5 (docs).

**Checkpoint**: Schema is safe to evolve; US1 + US2 both pass independently.

---

## Phase 5: User Story 3 - Inspect the map by hand (Priority: P3)

**Goal**: A reviewer can read the YAML form to see tenant strategy, boundaries, and critical
surfaces; YAML and JSON carry identical meaning.

**Independent Test**: Parse `contracts/example-map.saas.yaml` and the JSON equivalent → identical
validated object (round-trip), per SC-005.

### Tests for User Story 3 (write FIRST; must FAIL before implementation) ⚠️

- [x] T019 [P] [US3] Round-trip test: same logical map as JSON vs YAML → identical `validate()` result, in `packages/project-map/tests/roundtrip.test.ts` (SC-005).

### Implementation for User Story 3

- [x] T020 [US3] Implement YAML parse (to the same logical object as JSON) in `packages/project-map/src/io.ts` (depends on T014).

**Checkpoint**: All three stories independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [x] T021 [P] Run `quickstart.md` validation end-to-end against both example maps; confirm the acceptance table (SC-001…SC-007) holds.
- [x] T022 [P] Write `packages/project-map/README.md` (purpose, `validate()` usage, version policy, link to spec/contracts).
- [x] T023 Confirm domain-neutrality (no Retail Tower / ERPNext / POS terms) and zero secrets across package + tests (FR-012, FR-011).
- [x] T024 Verify the JSON Schema contract (`contracts/project-map.schema.json`) stays in sync with the Zod schema (add a drift check or note the sync procedure).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: T001 (docs) first; T002–T003 gated on explicit package/lockfile approval.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all stories.
- **User Stories (Phase 3–5)**: all depend on Foundational. US1 is the MVP; US2/US3 build on US1's schema/validator/IO but are independently testable.
- **Polish (Phase 6)**: after the desired stories are complete.

### User Story Dependencies

- **US1 (P1)**: after Foundational. The core schema + validator — no dependency on US2/US3.
- **US2 (P2)**: after US1 (extends schema with tolerant read + version policy); testable on its own.
- **US3 (P3)**: after US1 (adds YAML IO; round-trips against the same validator); testable on its own.

### Within Each User Story

- Tests written and FAILING before implementation (TDD).
- schema → validate → io → index (models before services before surface).

### Parallel Opportunities

- T002/T003 [P] within Setup (config vs package init — confirm no lockfile race).
- T004 [P] (Evidence Object) is foundational and parallel-safe.
- All US1 tests T006–T010 [P] run in parallel (separate test files).
- US1, US2, US3 tests are in separate files → parallel within their phases.

---

## Parallel Example: User Story 1

```bash
# Write all US1 tests together first (they must FAIL):
Task: "Accept test in packages/project-map/tests/schema.accept.test.ts"
Task: "Reject test in packages/project-map/tests/schema.reject.test.ts"
Task: "Tenant-model test in packages/project-map/tests/tenant-model.test.ts"
Task: "Evidence test in packages/project-map/tests/evidence.test.ts"
Task: "Secret-safety test in packages/project-map/tests/secret-safety.test.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup (ADR-001, then approved package init).
2. Phase 2 Foundational (Evidence Object + public surface).
3. Phase 3 US1 (full schema + honesty rule + validator + JSON IO).
4. **STOP & VALIDATE**: US1 independently — accept/reject + tenant-model honesty.

### Incremental Delivery

US1 (validate maps) → US2 (safe evolution) → US3 (YAML inspection). Each adds value without breaking
prior stories. Commit after each task or logical group, on the approved branch, only when requested.

---

## Notes

- **No code is written by generating this file.** Implementation waits on plan+tasks review.
- TDD: verify each test fails before implementing.
- Lockfile/dependency changes (T002, T003) require explicit approval per the constitution.
- ADR-001 (T001) clears the pending tech-decision record before package code begins.
- [P] = different files, no dependency; [US#] maps task → user story for traceability.
