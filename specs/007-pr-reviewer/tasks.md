---

description: "Task list for 007-pr-reviewer implementation"
---

# Tasks: PR Reviewer

**Input**: Design documents from `/specs/007-pr-reviewer/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/review-cli.md, contracts/review-json.md, quickstart.md

**Tests**: INCLUDED — Aker Build mandates TDD (constitution §Development Workflow; the 004/005/006
precedent maps every SC to a named test). Write each test FIRST and confirm it FAILS (RED) before the
implementation that makes it pass (GREEN).

**Organization**: Tasks grouped by user story. US1 (local-diff review) is the MVP; US2 (GitHub PR) and
US3 (scope) are additive P2 stories.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: US1 / US2 / US3 (user-story phases only)
- Exact file paths included. New package: `packages/review`. CLI command added to existing `packages/cli`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: New package scaffolding consistent with the other packages (project-map/scanner/gates/queue/prompt).

- [X] T001 Create `packages/review/` with `package.json` (name `@aker-build/review`, type module, deps on `@aker-build/gates`, `@aker-build/queue`, `@aker-build/scanner`, `zod`, `commander` not needed here; devDeps `vitest`, `typescript`) mirroring `packages/prompt/package.json`. **Lockfile change approved (additive importer block only).**
- [X] T002 [P] Add `packages/review/tsconfig.json` (extends root config; `exclude: ["tests/fixtures"]` per the 004 lesson) mirroring `packages/prompt/tsconfig.json`.
- [X] T003 [P] Add `packages/review/vitest.config.ts` (globals, node env) mirroring the other packages.
- [X] T004 Write **ADR-006** (`docs/decisions/ADR-006-diff-source.md`): diff source = read-only `git diff --name-only` (+ `gh` for PR mode); no diff-parsing dependency; no bundled GitHub client. Mirrors ADR-002/003/004/005. (Research R1/R5.)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Types, schema, changed-files source, and finding attribution — shared by ALL stories.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 [P] Define types in `packages/review/src/types.ts`: `ReviewMode`, `Verdict`, `ReviewFinding` (gate finding | scope violation), `ScopeViolation`, `ScopeResult`, `ReviewReport`, `ReviewOptions`. Reuse `Evidence` from `@aker-build/project-map` and `Finding`/`Severity`/`FindingStatus` from `@aker-build/gates` VERBATIM — never redefine. (data-model Entities.)
- [X] T006 [P] Define the Zod schema + `validateReview` + `REVIEW_SCHEMA_VERSION` in `packages/review/src/schema.ts` per contracts/review-json.md (verdict enum, findings union, scope, mode, changed_files). Reuse the 002/004 evidence/finding field shapes.
- [X] T007 [US-shared] Write FAILING test `packages/review/tests/git-source.test.ts`: `changedFiles(repoRoot)` returns repo-relative POSIX paths from `git diff --name-only` (working + staged + untracked), de-duplicated and code-unit sorted (uses copy-to-tempdir + `git init` fixture).
- [X] T008 [US-shared] Implement the read-only git runner `packages/review/src/git.ts`: `changedFiles(repoRoot, base?)` shelling out to `git diff --name-only` (read-only); normalize/dedupe/sort by code-unit comparison. Make T007 pass (GREEN). (Research R1, R7.)
- [X] T009 [US-shared] Write FAILING test `packages/review/tests/attribution.test.ts`: a finding whose `evidence.path` ∈ changed files is kept; a finding touching only UNCHANGED files is dropped. (data-model R2.)
- [X] T010 [US-shared] Implement `packages/review/src/attribute.ts`: `attributable(finding, changedFiles)` + filter helper; drop `not_applicable`; keep diff-attributable `risk`/`needs_verification`. Make T009 pass.

**Checkpoint**: Foundation ready — changed-files + attribution proven; user stories can begin.

---

## Phase 3: User Story 1 — Review a local diff (Priority: P1) 🎯 MVP

**Goal**: `aker-build review-pr --local-diff` returns Ready / Not Ready / Needs Verification with
evidence, with no credentials. Scope check is skipped + noted (US3 adds it).

**Independent Test**: Run local-diff review on a repo with a deliberate boundary violation on a changed
file → verdict Not Ready, naming the violated gate and citing evidence; runs with no network/credentials.

### Tests for User Story 1 (write first, confirm RED) ⚠️

- [X] T011 [P] [US1] FAILING `packages/review/tests/verdict-exhaustive.test.ts`: every run yields exactly one of `ready`/`not_ready`/`needs_verification` with evidence (SC-001).
- [X] T012 [P] [US1] FAILING `packages/review/tests/risk-blocks.test.ts`: a diff-attributable `risk` finding → `not_ready` naming the gate (SC-002).
- [X] T013 [P] [US1] FAILING `packages/review/tests/needs-verification.test.ts`: a diff-attributable `needs_verification` (and no risk) → `needs_verification`, never a false pass (SC-004, FR-007).
- [X] T014 [P] [US1] FAILING `packages/review/tests/read-only.test.ts`: repo/diff byte-unchanged after a review (SC-006, FR-008).
- [X] T015 [P] [US1] FAILING `packages/review/tests/no-secrets.test.ts`: secret-like evidence is surfaced by `signal` name only, never the raw value (FR-009, SC-007).
- [X] T016 [P] [US1] FAILING `packages/review/tests/determinism.test.ts`: same input → byte-identical `review.json` + `review.md` (FR-010, SC-007).
- [X] T017 [P] [US1] FAILING `packages/cli/tests/cli.review.test.ts` (local-diff cases): `runReviewCommand` exit 0 on success; exit 1 when no `project-map.json` (run scan first); exit 2 on not-a-Git-repo / both-or-neither of `--local-diff`/`<number>`.

### Implementation for User Story 1

- [X] T018 [US1] Implement the verdict engine `packages/review/src/verdict.ts`: `decideVerdict(attributableFindings, scopeResult)` — risk OR scope-violation → `not_ready`; else needs_verification → `needs_verification`; else `ready` (data-model R3, FR-012). Handles `scope.checked=false` so US1 works without US3. Makes T011–T013 pass.
- [X] T019 [US1] Implement `packages/review/src/io.ts`: write `review.json` (validated via `validateReview`) + `review.md` to the out-dir using the scanner's read-only `writeOutput`; expose `loadQueueItem(out, id)`. Reuse `@aker-build/scanner` io.
- [X] T020 [US1] Implement the Markdown renderer `packages/review/src/render.ts`: fixed-order sections (verdict, contributing findings w/ gate id + evidence, scope note, changed files); no secret values. Makes T015/T016 (md half) pass.
- [X] T021 [US1] Implement the orchestrator `packages/review/src/review.ts` `reviewLocalDiff(opts, deps)`: `git.changedFiles` → `gates.runGates` (full set, verbatim) → `attribute` → scope (skipped when no item) → `verdict` → assemble `ReviewReport`. Read-only throughout; `deps` seam (default-real) per R8. Makes T014/T016 pass.
- [X] T022 [US1] Implement `packages/review/src/index.ts` public surface: `reviewLocalDiff`, error classes `MissingQueueError`/`UnknownItemError`/`InvalidReviewError`/`GitUnavailableError`. (PR exports added in US2.) Make T011–T016 pass (GREEN).
- [X] T023 [US1] Implement `packages/cli/src/commands/review.ts` `runReviewCommand(arg, opts): number` mirroring `gates.ts` (sink/errSink, `--out`/`--stdout`/`--format`, exit codes 0/1/2/3, error-class→code mapping). Wire `--local-diff`. Register in `packages/cli/src/index.ts` as `review-pr`. Make T017 (local-diff) pass.

**Checkpoint**: US1 fully functional — local-diff review produces a verdict with evidence, read-only,
no credentials. **This is the MVP increment** (completes the constitution's `review-pr --local-diff`).

---

## Phase 4: User Story 3 — Review against declared scope (Priority: P2)

**Goal**: `--item <ID>` checks changed files against the item's `allowed_files`/`forbidden_files`;
out-of-scope edits flagged and drive the verdict. Without `--item`, scope is skipped + noted.

**Independent Test**: Review a diff touching a `forbidden_files` entry with `--item Q-001` → verdict
flags the out-of-scope change; a no-`--item` run notes scope was not checked.

### Tests for User Story 3 (write first, confirm RED) ⚠️

- [X] T024 [P] [US3] FAILING `packages/review/tests/scope-item.test.ts`: a changed file in `forbidden_files`, or outside a non-empty `allowed_files`, is flagged; verdict `not_ready` (SC-003). `allowed_files: []` ⇒ only forbidden applies.
- [X] T025 [P] [US3] FAILING `packages/review/tests/scope-skipped.test.ts`: no `--item` ⇒ `scope.checked=false`, `violations=[]`, no `item_id`, and gate review + verdict still run (FR-003).
- [X] T026 [P] [US3] FAILING `packages/cli/tests/cli.review.test.ts` (scope cases): `--item` with no `queue.json` → exit 1 (run queue first); unknown `--item` id → exit 2; in-scope diff → ready + no out-dir pollution.

### Implementation for User Story 3

- [X] T027 [US3] Implement `packages/review/src/scope.ts`: `checkScope(changedFiles, item)` → `ScopeResult` per data-model `out_of_scope` rule (forbidden OR outside-non-empty-allowed); `allowed_files: []` = no allow constraint. Makes T024 pass.
- [X] T028 [US3] Wire `--item` through `review.ts`/`io.ts`: load `QueueItem` from `queue.json` (via `@aker-build/queue` type + scanner read), call `checkScope`; absent item ⇒ `{checked:false}`. `MissingQueueError`/`UnknownItemError`. Makes T025 pass. **Also fixed an SC-007 self-reference bug: the reviewer's out-dir is now excluded from changed files (`excludeOutDir`) + regression test `out-dir-excluded.test.ts`.**
- [X] T029 [US3] Add `--item <ID>` to `packages/cli/src/commands/review.ts`; map `MissingQueueError`→exit 1, `UnknownItemError`→exit 2. Make T026 pass (GREEN).

**Checkpoint**: US1 + US3 work — local-diff review with optional declared-scope enforcement.

---

## Phase 5: User Story 2 — Review a GitHub PR (Priority: P2)

**Goal**: `aker-build review-pr <number>` reviews a PR via the user's `gh` CLI (same verdict core);
graceful-degrades when GitHub access is unavailable without blocking local-diff.

**Independent Test**: With `gh` unavailable, PR review reports the gap clearly (exit 2) and local-diff
review still works; with a stubbed PR changed-files source, a migration-safety risk flags TG-G3.

### Tests for User Story 2 (write first, confirm RED) ⚠️

- [X] T030 [P] [US2] FAILING `packages/review/tests/pr-degrade.test.ts`: `gh` unavailable ⇒ `GitHubUnavailableError` with a clear message; local-diff path unaffected (FR-006).
- [X] T031 [P] [US2] FAILING `packages/review/tests/pr-review.test.ts`: given a stubbed PR changed-files set, the same attribute→verdict core produces the verdict from PR-changed files (FR-005).
- [X] T032 [P] [US2] FAILING `packages/cli/tests/cli.review.test.ts` (PR cases): `gh`-unavailable → exit 2 (gap reported, local-diff still available).

### Implementation for User Story 2

- [X] T033 [US2] Implement the read-only gh runner `packages/review/src/gh.ts`: `prChangedFiles(number)` + optional `prMetadata(number)` via `gh pr view --json` (read-only); `GitHubUnavailableError` when `gh`/access is missing. (Research R5, R7.) Make T030 pass.
- [X] T034 [US2] Implement `reviewPr(number, opts, deps)` in `packages/review/src/pr.ts` reusing the US1 attribute→scope→verdict core (`assemble`) over the PR changed-files set; set `mode:"pr"`, `github_available:true`. Make T031 pass.
- [X] T035 [US2] Wire `<number>` mode + `gh`-unavailable→exit 2 in `packages/cli/src/commands/review.ts` (injectable `prDeps` seam). Make T032 pass (GREEN).

**Checkpoint**: All three stories functional and independently testable.

---

## Phase 6: Polish & Cross-Cutting Concerns

- [X] T036 [P] e2e chain (scan → gates → reviewLocalDiff) on a real fixture repo via `e2e-chain.test.ts`: an unguarded admin route in the diff → Not Ready, TG-G4 attributed, no out-dir pollution. (Real default-real path, no injection.)
- [X] T037 [P] Renderer determinism (`determinism.test.ts`) + `not_applicable` excluded from `findings[]` (schema `gateFindingSchema` only admits risk/needs_verification; `diffAttributableFindings` drops not_applicable — `attribution.test.ts`).
- [X] T038 Full verification: `pnpm -r test` → 8 packages green (165 tests; +45 from 007) and `pnpm -r typecheck` → 7 packages clean.
- [X] T039 [P] Read-only verified (`read-only.test.ts` snapshots a real fixture repo before/after with the real git source; e2e leaves the repo intact) and no secrets echoed (`no-secrets.test.ts`: raw value absent from md + json; signal name present).

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately.
- **Foundational (Phase 2)**: depends on Setup — BLOCKS all user stories.
- **US1 (Phase 3)**: depends on Foundational. **MVP** — the constitution's `review-pr --local-diff`.
- **US3 (Phase 4)**: depends on Foundational; integrates the scope result into the verdict engine built
  in US1 (T018 handles `checked:false` so US1 stands alone). Independently testable.
- **US2 (Phase 5)**: depends on Foundational; reuses the US1 attribute→verdict core over a PR
  changed-files source. Independently testable (stub the source).
- **Polish (Phase 6)**: after the desired stories are complete.

### Within Each User Story

- Tests FIRST and FAILING (RED) before implementation (GREEN). Types/schema before services; services
  before the CLI command. Code-unit sorting (not `localeCompare`) everywhere ordering matters.

### Parallel Opportunities

- T002/T003 (Setup) parallel; T005/T006 (types/schema) parallel.
- Within each story, the `[P]` test tasks (different files) run in parallel before implementation.
- After Foundational, US1 → then US3 and US2 can proceed in parallel (different files; the only shared
  file is `review.ts`/`cli/commands/review.ts`, so sequence those edits).

---

## Parallel Example: User Story 1 tests

```bash
# Write all US1 tests together (each a different file), confirm RED:
Task: "verdict-exhaustive.test.ts"   Task: "risk-blocks.test.ts"
Task: "needs-verification.test.ts"   Task: "read-only.test.ts"
Task: "no-secrets.test.ts"           Task: "determinism.test.ts"
Task: "cli.review.test.ts (local-diff cases)"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → 2. Phase 2 Foundational (CRITICAL) → 3. Phase 3 US1 → **STOP & VALIDATE**: local-diff
   review yields a verdict with evidence, read-only, no credentials. This completes the constitution's
   MVP `review-pr --local-diff`.

### Incremental Delivery

Setup + Foundational → US1 (MVP) → US3 (scope) → US2 (GitHub PR). Each story adds value without breaking
the previous; 004 is reused verbatim throughout (no upstream edit — the discriminating constraint).

---

## Notes

- `[P]` = different files, no incomplete dependencies. `[Story]` maps to spec.md user stories.
- Confirm each test FAILS before implementing. Reuse `Evidence` (002) + `Finding` (004) + `QueueItem`
  (005) shapes verbatim — never redefine.
- Never modify `packages/gates` (004) — if a task seems to need a 004 change, the approach is wrong.
- Unsigned commits authorized this session (`--no-gpg-sign`); never `git add -A`/`git add .`; stage
  named files only; commit/push/PR only when explicitly requested.
