# Implementation Plan: Agent Prompt Compiler

**Branch**: `006-agent-prompt-compiler` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-agent-prompt-compiler/spec.md`

## Summary

The terminal stage of the produce→route→prompt chain. A new package `packages/prompt` turns a routed
queue item (005) into a **safe, narrow, copy-paste-ready Markdown prompt** for an AI coding agent
(claude / codex / generic). Every prompt carries the required safety sections, the default git rules,
and the default stop conditions; renderers differ in **presentation only** (identical safety). Output
is printed to stdout and, unless `--stdout`, written to `.tenantguard/prompt-<ID>.md`. v0 is
deterministic, read-only, local-first, secret-free, and domain-neutral. Exposed via `tenantguard
prompt <ID> [--agent claude|codex]`.

**Technical approach** (decided at this plan layer):

1. **Templating = hand-written TypeScript Markdown builders** (no templating-engine dependency),
   resolving the spec's deferred choice. Recorded as **ADR-005** (a 006 task, mirroring ADR-002/003/004).
   See Research R1.
2. **Input edge**: `packages/prompt` reads `queue.json` (005) from the out-dir, looks up the item by
   `id`, and reuses `@tenantguard/scanner`'s read-only io for the optional file write. It imports
   `QueueItem` types from `@tenantguard/queue`. See Research R2.
3. **Section → field mapping grounded in the REAL 005 `QueueItem`** (data-model): **Objective ←
   `title`** (there is no `objective` field); the **scope check** = `title` + `allowed_files` +
   `validation` non-empty, with **`forbidden_files` present-may-be-empty** (the 005 deriver emits `[]`).
   This prevents a refuse-every-item bug. See Research R3 + data-model.

**No production code is created by this plan.** Implementation begins only after `plan.md` + `tasks.md`
are reviewed (AC-009; constitution §Development Workflow).

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (per ADR-001).
**Primary Dependencies**: `@tenantguard/queue` (`QueueItem` type + reading `queue.json`);
  `@tenantguard/scanner` (read-only `io.ts` for the optional file write); **Commander** (CLI, ADR-002).
  **No Zod schema needed** — the output is Markdown text, not a validated JSON artifact (the *input*
  queue.json is already validated by 005). No templating engine; no network client.
**Storage**: Reads `queue.json` from the out-dir (read-only). Writes `prompt-<ID>.md` to the
  **designated out-dir outside tracked source** (default `./.tenantguard/`, FR-014) unless `--stdout`.
**Testing**: Vitest. Fixtures = synthetic `QueueItem`s (a fully-scoped item, an item missing
  `validation`/`allowed_files`, a `forbidden_files: []` item) plus a `queue.json` for the CLI test.
**Target Platform**: Local dev machine / CI runner; Node CLI. No network.
**Project Type**: CLI tool + supporting library (monorepo packages).
**Performance Goals**: Compile a prompt in well under a second; no throughput target.
**Constraints**: All required sections present (FR-001, SC-001); explicit allowed/forbidden files
  (FR-002, SC-002); default git rules + stop conditions (FR-003, SC-003); narrow/scoped (FR-004);
  no secrets, no commit/push/merge (FR-007/FR-008, SC-004); identical safety across renderers (FR-015,
  SC-005); refuse on missing scope (FR-009, SC-006); deterministic (FR-016, SC-008); local-first
  (FR-011, SC-007); domain-neutral (FR-012).
**Scale/Scope**: claude / codex / generic renderers; one prompt per invocation; no orchestration,
  history, or execution (Non-Goals).

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.* Against the 8 named principles.

| Principle | Relevance | Status |
|-----------|-----------|--------|
| I. Source Truth First | The prompt is compiled from a routed item derived from current evidence; the **Repo-state verification** section makes the agent re-check before acting. | ✅ Pass |
| II. CLI First | Delivered as `tenantguard prompt <ID>`; local, no network/credentials (FR-011). | ✅ Pass |
| III. Evidence-Based | The **Context** section cites the item's `source.evidence`; no fabricated context. | ✅ Pass |
| IV. Spec-Compatible | Compiles any 005 item; no methodology requirement. | ✅ Pass |
| V. Agent Safety | **This feature IS Principle V made concrete** — every prompt carries Objective, Repo-state verification, Context, Scope, Allowed/Forbidden files, Validation, Git rules, Stop conditions, Final report (FR-001/003/005); narrow by default (FR-004); never commit/push/merge (FR-008). | ✅ Pass |
| VI. No Hidden Mutation | **Read-only**; output only to the out-dir; the prompt itself forbids commit/push/merge (FR-008). | ✅ Pass |
| VII. No Secrets | Secret-like context excluded + flagged, never rendered (FR-007, SC-004). | ✅ Pass |
| VIII. Clean Extraction | Generalized prompt content only — no Retail Tower / ERPNext / POS specifics (FR-012). | ✅ Pass |

**No gate violations — no Complexity Tracking entries required.** Docs-first: this plan creates no
code; implementation waits on reviewed `plan.md` + `tasks.md`.

## Project Structure

### Documentation (this feature)

```text
specs/006-agent-prompt-compiler/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (templating, input edge, section mapping, renderers, determinism)
├── data-model.md        # Phase 1 — Prompt sections, section→QueueItem-field mapping, renderer contract, defaults
├── quickstart.md        # Phase 1 — planned `prompt` usage + acceptance mapping
├── contracts/
│   ├── prompt-cli.md        # Phase 1 — `prompt` command contract (args, --agent, exit codes, output)
│   └── prompt-structure.md  # Phase 1 — required-section contract + invariant default blocks
├── checklists/
│   └── requirements.md   # (from /speckit.specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root) — PLANNED, not created by this command

```text
packages/prompt/              # prompt compiler + renderers (created at implementation time)
├── src/
│   ├── types.ts             # CompileOptions, AgentName, CompiledPrompt, ScopeGap
│   ├── defaults.ts          # the invariant blocks: DEFAULT_GIT_RULES, DEFAULT_STOP_CONDITIONS, FINAL_REPORT_FIELDS
│   ├── scope.ts             # scope-completeness check on a QueueItem (title+allowed_files+validation; FR-009)
│   ├── sections.ts          # build each required section's content from the QueueItem (section→field mapping)
│   ├── renderers/
│   │   ├── generic.ts       # generic Markdown rendering (the base/fallback)
│   │   ├── claude.ts        # claude-presentation (headings/preamble) over the same sections
│   │   └── codex.ts         # codex-presentation over the same sections
│   ├── compile.ts           # orchestrate: load queue.json → find <ID> → scope check → render
│   ├── io.ts                # read queue.json (via queue/scanner); write prompt-<ID>.md to out-dir
│   └── index.ts             # public surface: compilePrompt(id, opts) → CompiledPrompt
└── tests/
    ├── required-sections.test.ts     # every required section present (SC-001)
    ├── explicit-files.test.ts        # allowed/forbidden files named explicitly (SC-002)
    ├── default-blocks.test.ts        # git rules + stop conditions present + invariant (SC-003)
    ├── no-secrets-no-mutation.test.ts# no secrets; no commit/push/merge instruction (SC-004)
    ├── renderer-parity.test.ts       # claude/codex/generic: invariant blocks byte-identical (SC-005)
    ├── missing-scope-refusal.test.ts # missing title/allowed_files/validation → refusal (SC-006)
    ├── forbidden-empty-ok.test.ts    # forbidden_files:[] still compiles (real-005-item regression)
    ├── unknown-agent-fallback.test.ts# unknown agent → generic + note (FR-010)
    └── determinism.test.ts           # same (item,agent) → byte-identical (SC-008)

packages/cli/                 # extend the existing tenantguard CLI (no new package)
├── src/commands/prompt.ts    # `tenantguard prompt <ID> [--agent] [--out] [--stdout]`
└── tests/cli.prompt.test.ts  # compiles from queue.json; exit codes; run-queue-first; unknown id/agent
```

**Structure Decision**: A new `packages/prompt` library (scope check + section builders + renderers)
plus a thin new command in the **existing** `packages/cli`. `packages/prompt` depends on
`@tenantguard/queue` (the `QueueItem` input) and `@tenantguard/scanner` (read-only io). No new Zod
schema: the output is Markdown text; the input `queue.json` is already 005-validated. This plan **does
not create** any of the above; the split is confirmable at `/speckit-tasks`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
