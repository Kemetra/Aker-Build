---
description: "Task list for 006-agent-prompt-compiler implementation"
---

# Tasks: Agent Prompt Compiler

**Input**: Design documents from `/specs/006-agent-prompt-compiler/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/{prompt-cli,prompt-structure}.md
**Tests**: INCLUDED — TDD per the constitution (Development Workflow) and the feature request.

**Organization**: Grouped by the two user stories in `spec.md` (US1 P1 compile a safe scoped prompt,
US2 P2 render per agent), each independently testable. Output is a safe Markdown prompt; the input is a
real `QueueItem` from `@aker-build/queue` (005).

> **GATE**: Writing this file creates no code. Implementation begins only after `plan.md` + `tasks.md`
> are reviewed. Package/lockfile changes (T002) are gated on explicit approval. The compiler is
> **read-only on the scanned repo** and the prompt it emits **never** instructs commit/push/merge.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable (different files, no incomplete-task dependency)
- **[Story]**: US1 / US2 (setup/foundational/polish carry no label)
- Paths follow the `packages/prompt` + `packages/cli` layout from `plan.md`.

---

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Author `docs/decisions/ADR-005-prompt-templating.md` recording **hand-written TypeScript Markdown builders** (no templating engine) as the v0 approach, citing `research.md` R1. (Docs-only.)
- [x] T002 Initialize `packages/prompt/` (`package.json` depending on `@aker-build/queue` + `@aker-build/scanner` workspace deps; `tsconfig.json` with `exclude: ["tests/fixtures"]` if any on-disk fixtures) and add a `prompt` command surface to the existing `packages/cli`. **Approved package/lockfile change.**
- [x] T003 [P] Configure Vitest for `packages/prompt` (`vitest.config.ts`), reusing the workspace toolchain.

**Checkpoint**: `packages/prompt` skeletoned; ADR-005 recorded. No compiler logic yet.

---

## Phase 2: Foundational (Blocking Prerequisites)

**⚠️ CRITICAL**: No user-story work begins until this phase is complete.

- [x] T004 [P] Define types (`AgentName`, `CompileOptions`, `CompiledPrompt`, `ScopeGap`) in `packages/prompt/src/types.ts` per `data-model.md`.
- [x] T005 [P] Define the invariant default blocks (`DEFAULT_GIT_RULES`, `DEFAULT_STOP_CONDITIONS`, `FINAL_REPORT_FIELDS`) — single source of truth — in `packages/prompt/src/defaults.ts`, verbatim from the spec (FR-003, FR-015).
- [x] T006 Implement the scope-completeness check on a real `QueueItem` (`title` + `allowed_files` + `validation` non-empty; `forbidden_files` may be empty) returning a `ScopeGap` in `packages/prompt/src/scope.ts` (FR-009, data-model; depends on T004).
- [x] T007 Implement section builders (Objective←title, Repo-state verification (const), Context←source.evidence, Scope, Allowed/Forbidden files, Validation, Git rules (const), Stop conditions←item∪defaults, Final report←final_report.required) in `packages/prompt/src/sections.ts` (data-model mapping; depends on T004, T005).

**Checkpoint**: types + invariant blocks + scope check + section builders ready.

---

## Phase 3: User Story 1 - Compile a safe, scoped prompt (Priority: P1) 🎯 MVP

**Goal**: Compiling a routed item yields a Markdown prompt with every required section, explicit
allowed/forbidden files, the default git rules + stop conditions, no secrets, and no commit/push/merge.

**Independent Test**: Compile a fully-scoped item → assert all ten sections present, files named
explicitly, invariant blocks present; compile a scope-incomplete item → refusal.

### Tests for User Story 1 (write FIRST; must FAIL) ⚠️

- [x] T008 [P] [US1] Required-sections test: all ten required sections present in fixed order (SC-001), in `packages/prompt/tests/required-sections.test.ts`.
- [x] T009 [P] [US1] Explicit-files test: allowed + forbidden files named explicitly; `forbidden_files:[]` renders "(none …)" (SC-002), in `packages/prompt/tests/explicit-files.test.ts`.
- [x] T010 [P] [US1] Default-blocks test: git rules + stop conditions present and matching the spec defaults (SC-003), in `packages/prompt/tests/default-blocks.test.ts`.
- [x] T011 [P] [US1] No-secrets/no-mutation test: no secret value rendered; no commit/push/merge instruction (SC-004), in `packages/prompt/tests/no-secrets-no-mutation.test.ts`.
- [x] T012 [P] [US1] Missing-scope-refusal test: an item missing `title`/`allowed_files`/`validation` is refused with the missing fields named (SC-006), in `packages/prompt/tests/missing-scope-refusal.test.ts`.
- [x] T013 [P] [US1] Forbidden-empty-ok test: an item with `forbidden_files:[]` compiles (does NOT refuse) — real-005-item regression, in `packages/prompt/tests/forbidden-empty-ok.test.ts`.

### Implementation for User Story 1

- [x] T014 [US1] Implement the generic renderer (assemble the ten sections into Markdown) in `packages/prompt/src/renderers/generic.ts` (depends on T007).
- [x] T015 [US1] Implement the compile orchestrator in `packages/prompt/src/compile.ts`: scope check → refuse on gap (ScopeGap) or render; deterministic section order (FR-009, FR-016; depends on T006, T014).
- [x] T016 [US1] Implement io in `packages/prompt/src/io.ts`: read `queue.json` (via queue/scanner) + look up `<ID>`; write `prompt-<ID>.md` to the out-dir (FR-013, FR-014; depends on T015).
- [x] T017 [US1] Public surface `compilePrompt(id, opts): CompiledPrompt` in `packages/prompt/src/index.ts` (depends on T015, T016).

**Checkpoint**: MVP — a fully-scoped item compiles to a safe prompt; an unscoped item is refused.

---

## Phase 4: User Story 2 - Render for a chosen agent (Priority: P2)

**Goal**: claude / codex / generic renderers all carry the full required-section set and byte-identical
git rules + stop conditions; an unknown agent falls back to generic with a note.

**Independent Test**: Compile the same item for claude/codex/generic → all three have the full section
set; the invariant blocks are byte-identical; an unknown agent yields the generic prompt + a note.

### Tests for User Story 2 (write FIRST; must FAIL) ⚠️

- [x] T018 [P] [US2] Renderer-parity test: claude/codex/generic produce byte-identical git rules + stop conditions + final-report blocks; all have the ten sections (SC-005), in `packages/prompt/tests/renderer-parity.test.ts`.
- [x] T019 [P] [US2] Unknown-agent-fallback test: an unknown `--agent` value renders the generic prompt and includes a note (FR-010), in `packages/prompt/tests/unknown-agent-fallback.test.ts`.
- [x] T020 [P] [US2] Determinism test: the same `(item, agent)` compiled twice is byte-identical (SC-008), in `packages/prompt/tests/determinism.test.ts`.

### Implementation for User Story 2

- [x] T021 [P] [US2] Implement the claude renderer (presentation only over the shared sections/constants) in `packages/prompt/src/renderers/claude.ts` (depends on T007, T014).
- [x] T022 [P] [US2] Implement the codex renderer (presentation only) in `packages/prompt/src/renderers/codex.ts` (depends on T007, T014).
- [x] T023 [US2] Wire renderer selection + unknown-agent→generic fallback (with note) into `packages/prompt/src/compile.ts` (FR-010, FR-015; depends on T021, T022).

**Checkpoint**: All three renderers carry identical safety; US1 + US2 pass independently.

---

## Phase 5: CLI (`aker-build prompt`)

**Goal**: Wire the compiler into the `aker-build` CLI per `contracts/prompt-cli.md`.

### Tests (write FIRST; must FAIL) ⚠️

- [x] T024 [P] CLI test: `prompt <ID> [--agent] [--out] [--stdout]` prints the prompt + writes `prompt-<ID>.md`, exits 0; missing `queue.json` exits 1 ("run queue first"); unknown `<ID>` / scope-incomplete exits 2; scanned repo unchanged, in `packages/cli/tests/cli.prompt.test.ts`.

### Implementation

- [x] T025 [US1] Implement the `prompt` command (`<ID>`, `--agent`, `--out`, `--stdout`) in `packages/cli/src/commands/prompt.ts` and register it in `packages/cli/src/index.ts` (depends on T017, T023).

---

## Phase 6: Polish & Cross-Cutting

- [x] T026 [P] Verify local-first: no network client or credential read anywhere in `packages/prompt` (SC-007).
- [x] T027 [P] Verify domain-neutral: no Retail Tower / ERPNext / POS strings (FR-012).
- [x] T028 Run `pnpm -r test` + `pnpm -r typecheck`; confirm `packages/prompt` + `packages/cli` green and the end-to-end scan→gates→queue→route→prompt flow is exercised by tests.

---

## Dependencies (story completion order)

```text
Setup (T001–T003)
  └─ Foundational (T004–T007)   ← blocks all stories
       ├─ US1 (T008–T017)  🎯 MVP — compile a safe prompt + refusal
       └─ US2 (T018–T023)  — per-agent renderers; needs sections (T007) + generic (T014)
  └─ CLI (T024–T025)  — depends on US1 (T017) + US2 (T023)
  └─ Polish (T026–T028)
```

## Parallel Example: User Story 1

```bash
# Write US1 tests first (must FAIL):
Task: "Required-sections test in packages/prompt/tests/required-sections.test.ts"
Task: "Explicit-files test in packages/prompt/tests/explicit-files.test.ts"
Task: "Default-blocks test in packages/prompt/tests/default-blocks.test.ts"
Task: "No-secrets/no-mutation test in packages/prompt/tests/no-secrets-no-mutation.test.ts"
Task: "Missing-scope-refusal test in packages/prompt/tests/missing-scope-refusal.test.ts"
Task: "Forbidden-empty-ok test in packages/prompt/tests/forbidden-empty-ok.test.ts"
```

---

## Implementation Strategy

### MVP First (US1)

1. Setup (ADR-005 + approved package init).
2. Foundational (types + invariant blocks + scope check + section builders).
3. US1 (generic renderer + compile + io + refusal).
4. **STOP & VALIDATE**: compile a fully-scoped item → all sections + safety; compile an unscoped item → refusal.

### Incremental Delivery

US1 (safe prompt + refusal) → US2 (per-agent renderers, parity, unknown-agent fallback, determinism)
→ CLI → polish. Commit after each task or logical group, on the approved branch, only when requested.

---

## Notes

- **No code is written by generating this file.** Implementation waits on plan+tasks review.
- TDD: verify each test fails before implementing.
- Compiler is **read-only on the scanned repo**; output goes to a designated path outside tracked source.
- Objective ← `title` (no `objective` field); scope check excludes `forbidden_files` (may be empty).
- Invariant blocks live once in `defaults.ts`; renderers reference them (never re-author) → SC-005.
- [P] = different files, no dependency; [US#] maps task → user story.
