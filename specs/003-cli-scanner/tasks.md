---
description: "Task list for 003-cli-scanner implementation"
---

# Tasks: CLI Scanner

**Input**: Design documents from `/specs/003-cli-scanner/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/cli-commands.md
**Tests**: INCLUDED — TDD per the constitution (Development Workflow) and the feature request.

**Organization**: Grouped by the three user stories in `spec.md` (US1 P1, US2 P2, US3 P3), each
independently testable. Output is a `ProjectMap` validated with `@tenantguard/project-map` (002).

> **GATE**: Writing this file creates no code. Implementation begins only after `plan.md` + `tasks.md`
> are reviewed. Package/lockfile changes (T002–T003) are gated on explicit approval (granted for this
> build). The scanner is **strictly read-only on the scanned repo** (FR-003) — every task preserves that.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 / US3 (setup/foundational/polish carry no label)
- Paths follow the `packages/scanner` + `packages/cli` layout from `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Author `docs/decisions/ADR-002-cli-framework.md` recording **Commander** as the CLI framework (resolves the choice ADR-001 deferred), citing `research.md` R1 and the blueprint. (Docs-only.)
- [x] T002 Initialize `packages/scanner/` (`package.json` depending on `@tenantguard/project-map` workspace + `yaml`; `tsconfig.json`) and `packages/cli/` (`package.json` depending on `commander` + `@tenantguard/project-map` + scanner; `bin` entry; `tsconfig.json`). **Approved package/lockfile change.**
- [x] T003 [P] Configure Vitest for both packages (`vitest.config.ts` each), reusing the workspace toolchain.

**Checkpoint**: Both packages skeletoned; ADR-002 recorded. No detection logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 [P] Define scanner-internal types (`ScanRun`, `DetectionSignal` reusing 002 Evidence Object, `RunNote`, `ScanResult`) in `packages/scanner/src/types.ts` per `data-model.md`.
- [x] T005 Implement read-only fs traversal (`node:fs`/`node:path`, no git shell-out, no network) with skip rules (node_modules, .git internals) in `packages/scanner/src/io.ts` (FR-003, FR-011, R2).
- [x] T006 Create test fixtures under `packages/scanner/tests/fixtures/`: a multi-tenant SaaS repo, an empty dir, a non-SaaS repo, a monorepo (`apps/*`+`packages/*`), and an unreadable-path case.

**Checkpoint**: Types + read-only traversal + fixtures ready for all stories.

---

## Phase 3: User Story 1 - Scan a repo into a conforming map (Priority: P1) 🎯 MVP

**Goal**: `tenantguard scan` on a real repo produces a `project-map.json` that validates against 002,
with every populated value traceable to a detection signal, and the scanned repo unchanged.

**Independent Test**: Scan the multi-tenant fixture → emitted map passes `@tenantguard/project-map`
`validate()`; assert 0 scanned files changed; assert each populated value has a signal.

### Tests for User Story 1 (write FIRST; must FAIL before implementation) ⚠️

- [x] T007 [P] [US1] SaaS scan test: scanning the SaaS fixture yields a map that `validate()` accepts (SC-001), in `packages/scanner/tests/scan.saas.test.ts`.
- [x] T008 [P] [US1] Read-only test: snapshot fixture file mtimes/hashes before+after a scan; assert 0 created/modified/deleted (SC-002), in `packages/scanner/tests/readonly.test.ts`.
- [x] T009 [P] [US1] Evidence-trace test: every populated map value has ≥1 DetectionSignal; 0 fabricated values (SC-003), in `packages/scanner/tests/evidence-trace.test.ts`.
- [x] T010 [P] [US1] Monorepo test: `apps/*`+`packages/*` fixture yields multiple `repos[]` (FR-007), in `packages/scanner/tests/monorepo.test.ts`.

### Implementation for User Story 1

- [x] T011 [P] [US1] Implement stack detection (runtime/package_manager/frameworks from manifests) in `packages/scanner/src/detect/stack.ts` per `data-model.md` rules (depends on T005).
- [x] T012 [P] [US1] Implement repos/area + monorepo detection in `packages/scanner/src/detect/repos.ts` (depends on T005).
- [x] T013 [US1] Implement map assembly → a 002 `ProjectMap` from signals, with **deterministic stable ordering**, in `packages/scanner/src/assemble.ts` (depends on T011, T012).
- [x] T014 [US1] **Validate the assembled map with `@tenantguard/project-map` `validate()` before returning**; on failure, error with field-level errors and emit nothing (R5), in `packages/scanner/src/scan.ts` (depends on T013).
- [x] T015 [US1] Implement output write (`project-map.json` to designated `--out`, default `./.tenantguard/`, outside scanned tracked source) in `packages/scanner/src/io.ts` (FR-003; depends on T014).
- [x] T016 [US1] Public surface `scan(targetPath, opts): ScanResult` in `packages/scanner/src/index.ts` (depends on T014).

**Checkpoint**: MVP — a repo can be scanned into a 002-valid, evidence-traced, read-only map.

---

## Phase 4: User Story 2 - Scan an empty or unfamiliar repo safely (Priority: P2)

**Goal**: Empty / non-SaaS / unknown-stack repos yield a valid, honest map (empty collections,
`not_detected`, null stack fields, low-confidence) plus an insufficient-evidence note — never a crash
or fabrication.

**Independent Test**: Scan the empty + non-SaaS fixtures → each yields a 002-valid map with empty
collections, `tenant_model.status: not_detected`, and an `insufficient_evidence` run note.

### Tests for User Story 2 (write FIRST; must FAIL before implementation) ⚠️

- [x] T017 [P] [US2] Empty/non-SaaS test: both fixtures yield 002-valid maps with empty collections, null stack fields, `tenant_model.status: not_detected`, no fabrication (SC-004), in `packages/scanner/tests/scan.empty.test.ts`.
- [x] T018 [P] [US2] Robustness test: an unreadable path is skipped with a RunNote, scan does not crash (FR-009), in `packages/scanner/tests/robustness.test.ts`.
- [x] T019 [P] [US2] Non-Git dir test: scanning a non-Git directory reports out-of-MVP-scope clearly rather than a misleading map (edge case), in `packages/scanner/tests/non-git.test.ts`.

### Implementation for User Story 2

- [x] T020 [US2] Implement honesty defaults in assembly: empty/null + low-confidence + `not_detected` when no signal; emit `insufficient_evidence` RunNote (FR-006, FR-008) in `packages/scanner/src/assemble.ts` (depends on T013).
- [x] T021 [US2] Implement skip-with-note for unreadable paths and non-Git detection in `packages/scanner/src/io.ts` / `scan.ts` (FR-009; depends on T005).

**Checkpoint**: Scanner degrades gracefully and honestly; US1 + US2 pass independently.

---

## Phase 5: User Story 3 - Re-scan, stable comparable output (Priority: P3)

**Goal**: Re-scanning an unchanged repo yields an equivalent, deterministic map suitable for diffing.

**Independent Test**: Scan the same fixture twice → the two maps are deep-equal (excluding any
non-deterministic metadata like timestamps).

### Tests for User Story 3 (write FIRST; must FAIL before implementation) ⚠️

- [x] T022 [P] [US3] Determinism test: two scans of an unchanged fixture produce deep-equal maps (stable ordering), excluding clock fields (SC-005), in `packages/scanner/tests/determinism.test.ts`.

### Implementation for User Story 3

- [x] T023 [US3] Enforce stable sorting of all collections (repos, boundaries, frameworks, surfaces, signals) and exclude clocks from the compared map surface in `packages/scanner/src/assemble.ts` (R3; depends on T013).

**Checkpoint**: Output is deterministic; all three stories pass independently.

---

## Phase 6: Secret Safety (cross-cutting, in-scope requirement)

- [x] T024 [P] Secret-safety test: secret-like content in a fixture is flagged as a RunNote/signal (`signal: secret_like_content` + path), and **the secret value never appears** in the map, notes, or stdout (SC-006, FR-012), in `packages/scanner/tests/secrets.test.ts` (write FIRST, fails).
- [x] T025 Implement secret-like detection in `packages/scanner/src/detect/secrets.ts` — flag only (path + signal), never read the value into output (depends on T005).

---

## Phase 7: CLI (`tenantguard scan` / `map`)

**Goal**: Wire the scanner library into the `tenantguard` CLI per `contracts/cli-commands.md`.

### Tests (write FIRST; must FAIL) ⚠️

- [x] T026 [P] CLI scan test: `scan [path] --out <dir>` produces a 002-valid map file, exits 0; non-Git dir exits 1; scanned repo unchanged, in `packages/cli/tests/cli.scan.test.ts`.
- [x] T027 [P] CLI map test: `map` prints the produced map; exits 1 with a "run scan first" message when none exists, in `packages/cli/tests/cli.map.test.ts`.

### Implementation

- [x] T028 [US1] Implement the Commander program + `scan` command (`[path]`, `--out`, `--stdout`, `--format`) in `packages/cli/src/commands/scan.ts` + `packages/cli/src/index.ts` (depends on T016).
- [x] T029 [US3] Implement the `map` command (read + render produced map, `--format`) in `packages/cli/src/commands/map.ts` (depends on T015).
- [x] T030 Wire the `#!` bin entry (`packages/cli/src/bin.ts`) to the program and `package.json` `bin: { tenantguard }`.

**Checkpoint**: `tenantguard scan` / `map` work end-to-end against fixtures.

---

## Phase 8: Polish & Cross-Cutting

- [x] T031 [P] Run `quickstart.md` end-to-end against fixtures; confirm the acceptance table (SC-001…SC-007) holds.
- [x] T032 [P] Write `packages/scanner/README.md` and `packages/cli/README.md` (usage, read-only guarantee, output path, link to spec/contract).
- [x] T033 Confirm no network/credentials path exists (no http client, no git shell-out) and verify offline run (SC-007).
- [x] T034 Confirm domain-neutrality (no Retail Tower / ERPNext / POS detection) and zero secrets across packages + tests (FR-013, FR-012).

---

## Dependencies & Execution Order

- **Setup (P1)**: T001 (docs) → T002/T003 (approved package/lockfile).
- **Foundational (P2)**: T004–T006 — BLOCKS all stories.
- **US1 (P3)**: MVP — scan → assemble → validate → write. US2/US3 extend assembly; CLI (Phase 7) wraps US1/US3.
- **Secret safety (P6)** and **CLI (P7)** depend on US1's scanner surface (T016).
- **Polish (P8)**: after desired stories complete.

### Within each story

- Tests written and FAILING before implementation (TDD).
- detect → assemble → validate → write → public surface → CLI.

### Parallel opportunities

- Detection modules T011/T012 [P]; tests T007–T010, T017–T019, T022, T024, T026–T027 [P] (separate files).

---

## Parallel Example: User Story 1

```bash
# Write US1 tests first (must FAIL):
Task: "SaaS scan test in packages/scanner/tests/scan.saas.test.ts"
Task: "Read-only test in packages/scanner/tests/readonly.test.ts"
Task: "Evidence-trace test in packages/scanner/tests/evidence-trace.test.ts"
Task: "Monorepo test in packages/scanner/tests/monorepo.test.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Setup (ADR-002 + approved package init).
2. Foundational (types + read-only traversal + fixtures).
3. US1 (scan → 002-valid, evidence-traced, read-only map).
4. **STOP & VALIDATE**: scan the SaaS fixture; confirm 002-valid + read-only.

### Incremental Delivery

US1 (scan a repo) → US2 (graceful/honest degradation) → US3 (determinism) → secret safety → CLI →
polish. Commit after each task or logical group, on the approved branch, only when requested.

---

## Notes

- **No code is written by generating this file.** Implementation waits on plan+tasks review.
- TDD: verify each test fails before implementing.
- Scanner is **read-only on the scanned repo** — output goes to a designated path outside tracked source.
- Output **must validate against `@tenantguard/project-map`** before being written (no invalid maps).
- [P] = different files, no dependency; [US#] maps task → user story.
