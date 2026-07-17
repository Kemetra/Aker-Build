# Feature Specification: Agent Prompt Compiler

**Feature Branch**: `006-agent-prompt-compiler`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "Generate safe prompts for Claude, Codex, and generic coding agents. Docs only; no production code."

**Depends on (direct)**: `005-derived-queue-router` — the compiler's input is a routed queue item.
**Depends on (transitive, via 005)**: `002-project-map-schema`, `003-cli-scanner`, `004-saas-gates-v0`
— 005 derives queue items from the map (002), scanner output (003), and gate findings (004), so 006
relies on them only indirectly through the queue item it receives. `001-product-foundation` is the
foundational spec all features assume.
**Blocks**: — (terminal of the produce→route→prompt chain for MVP)

---

## Purpose *(mandatory)*

The Prompt Compiler turns a routed queue item into a **safe, narrow, copy-paste-ready** prompt for an
AI coding agent (Claude, Codex, or a generic agent). Safe-by-default prompts are Aker Build's core
mechanism for preventing agents from changing too many files.

This spec defines the **required prompt structure**, **default git rules and stop conditions**, and the
**per-agent rendering** requirement — not the templating engine or language.

---

## Clarifications

### Session 2026-06-18

- Q: What is the prompt output shape/format? → A: Plain **Markdown** (copy-paste-ready) printed to stdout; when not `--stdout`, also written to `.aker-build/prompt-<ID>.md`. The safety contract is the section structure, not a JSON envelope.
- Q: How does the compiler obtain the item for `aker-build prompt <ID>`? → A: It reads `queue.json` (005) from the out-dir and looks up the item by `id`. Missing `queue.json` → "run `aker-build queue` first"; unknown `<ID>` → clear error.
- Q: When an item lacks required scope info (FR-009), refuse or mark the gap? → A: **Refuse** with a non-zero exit and a message naming the missing scope fields — never emit a partial/unsafe prompt.
- Q: What differs between the claude / codex / generic renderers? → A: Only **presentation** (heading style / agent-appropriate framing preamble). The section set, git rules, stop conditions, allowed/forbidden files, and final-report are identical in meaning across all renderers (SC-005). Unknown agent → generic + a note (FR-010).
- Q: Is compilation deterministic? → A: Yes — for the same (item, agent) input the output is byte-stable (fixed section order; no clock/randomness), so prompts are diffable and testable.

---

## User Scenarios & Testing *(mandatory)*

"User" is a developer compiling a prompt to hand to an AI coding agent.

### User Story 1 - Compile a safe, scoped prompt (Priority: P1)

A developer compiles a prompt for a routed queue item; the prompt is narrow, names allowed/forbidden
files, and includes all required safety sections.

**Why this priority**: This is the feature's whole point — converting a scoped task into controlled
agent execution.

**Independent Test**: Compile a prompt for a queue item and confirm it contains every required section
and names the item's allowed/forbidden files explicitly.

**Acceptance Scenarios**:

1. **Given** a routed queue item, **When** a prompt is compiled, **Then** it includes objective,
   repo-state verification, context, scope, allowed files, forbidden files, validation commands, git
   rules, stop conditions, and final-report format.
2. **Given** a compiled prompt, **When** inspected, **Then** it names the item's allowed and forbidden
   files explicitly (not vaguely).
3. **Given** a compiled prompt, **When** inspected, **Then** it contains no secrets and never instructs
   the agent to commit, push, or merge.

### User Story 2 - Render for a chosen agent (Priority: P2)

A developer picks the agent (`--agent claude` or `--agent codex`, or generic) and gets a prompt
rendered appropriately for that agent, with identical safety guarantees.

**Why this priority**: Different agents have different prompt conventions; the safety contract must
hold regardless of renderer.

**Independent Test**: Compile the same item for claude, codex, and generic and confirm all three carry
the full required-section set and the same git rules/stop conditions.

**Acceptance Scenarios**:

1. **Given** an item, **When** compiled with `--agent claude` vs `--agent codex` vs generic, **Then**
   each output contains all required safety sections.
2. **Given** any agent renderer, **When** compiled, **Then** the default git rules and stop conditions
   are present and unchanged in meaning.

---

### Edge Cases

- **Item missing required scope info**: compilation **refuses** (non-zero exit, missing fields named)
  rather than emitting an unsafe (unscoped) prompt.
- **Secret-like content in context**: excluded from the prompt and flagged, never rendered.
- **Unknown agent name**: falls back to the generic renderer (with a note) rather than failing hard.
- **Very large context**: the prompt stays scoped to the item; it does not dump the whole repo.

---

## Required Prompt Structure *(mandatory)*

Every compiled prompt MUST contain these sections:

```text
Objective
Repo-state verification
Context
Scope
Allowed files
Forbidden files
Validation commands
Git rules
Stop conditions
Final report format
```

### Default git rules (always included)

```text
- Do not commit unless explicitly requested.
- Do not push unless explicitly requested.
- Do not open a PR unless explicitly requested.
- Stage named files only if staging is explicitly requested.
- Never use git add -A.
- Never use git add .
- Do not modify secrets, credentials, environment files, or generated lockfiles unless explicitly allowed.
```

### Default stop conditions (always included)

```text
- Required files are missing.
- Scope requires migration but the task did not allow migrations.
- Public API shape must change but the contract update was not in scope.
- Auth or tenant model is unclear.
- Validation cannot run.
- Unrelated test failures appear.
```

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The compiler MUST turn a routed queue item into a prompt containing all required sections.
- **FR-002**: The prompt MUST name the item's allowed files and forbidden files explicitly.
- **FR-003**: The prompt MUST include the default git rules and default stop conditions (above).
- **FR-004**: The prompt MUST be narrow and scope-limited — it MUST NOT instruct broad refactors or
  whole-repo changes.
- **FR-005**: The prompt MUST require a final report (files changed, summary, tests run, evidence used,
  risks/gaps, git status, next safe action).
- **FR-006**: The compiler MUST render for at least Claude, Codex, and a generic agent, with identical
  safety guarantees across renderers.
- **FR-007**: The prompt MUST NOT contain secrets; secret-like context MUST be excluded and flagged.
- **FR-008**: The prompt MUST NOT instruct the agent to commit, push, merge, or auto-execute.
- **FR-009**: If an item lacks required scope info — a non-empty `title` (→ Objective), non-empty
  `allowed_files`, and non-empty `validation` (`forbidden_files` may be empty) — the compiler MUST
  **refuse** with a non-zero exit and a message naming the missing fields — it MUST NOT emit a
  partial/unsafe prompt.
- **FR-010**: An unknown agent name MUST fall back to the generic renderer with a note, not fail hard.
- **FR-011**: Compilation MUST run with no network access and no credentials (local-first).
- **FR-012**: The compiler MUST be domain-neutral — no Retail Tower/ERPNext/POS specifics.
- **FR-013**: The compiler MUST read the routed queue item by `id` from `queue.json` (005) in the
  designated out-dir; a missing `queue.json` MUST signal "run `aker-build queue` first" and an unknown
  `<ID>` MUST error clearly (no prompt emitted).
- **FR-014**: The prompt MUST be emitted as **Markdown** (copy-paste-ready) to stdout; when not
  `--stdout`, it MUST also be written to `.aker-build/prompt-<ID>.md` (outside the scanned repo's
  tracked source).
- **FR-015**: Per-renderer differences MUST be limited to **presentation** (heading style / framing);
  the section set, git rules, stop conditions, allowed/forbidden files, and final-report MUST be
  identical in meaning across claude/codex/generic (SC-005).
- **FR-016**: Compilation MUST be deterministic for the same `(item, agent)` input (fixed section
  order; no clock/randomness) — output is byte-stable and diffable.

### Key Entities

- **Prompt**: the compiled, scope-limited Markdown instruction set for an agent (printed; optionally
  written to `.aker-build/prompt-<ID>.md`).
- **Renderer**: an agent-specific formatter (claude/codex/generic) that varies **presentation only**
  over the same safety contract; unknown agent → generic + note.
- **Queue Item** (from 005): the input the prompt is compiled from, looked up by `id` in `queue.json`.

---

## CLI Surface *(mandatory)*

```text
aker-build prompt <ID> --agent claude     compile a safe prompt for queue item <ID> for Claude
aker-build prompt <ID> --agent codex      compile a safe prompt for Codex
aker-build prompt <ID>                    compile a safe prompt for a generic agent
aker-build prompt <ID> --stdout           print the prompt only (no file written)
```

The item `<ID>` is looked up in `<out>/queue.json` (default `.aker-build/`). The compiled Markdown is
printed to stdout and, unless `--stdout`, also written to `.aker-build/prompt-<ID>.md`.

---

## Required Outputs *(mandatory)*

```text
safe agent prompt   copy-paste-ready Markdown, scope-limited, all required sections present.
                    Printed to stdout; also written to .aker-build/prompt-<ID>.md unless --stdout.
```

---

## Non-Goals *(mandatory)*

```text
- Executing the prompt or the agent (never in MVP).
- Committing, pushing, or merging anything.
- Multi-step agent orchestration or tool-calling design.
- Storing/replaying prompt history (later/dashboard concern).
- Exhaustive support for every agent on the market (claude/codex/generic for MVP).
- Choosing a templating engine or language (decided at plan layer).
- Retail Tower / ERPNext / POS-specific prompt content.
```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of compiled prompts contain all required sections.
- **SC-002**: 100% of compiled prompts name explicit allowed and forbidden files.
- **SC-003**: 100% of compiled prompts include the default git rules and stop conditions.
- **SC-004**: 0 compiled prompts contain secrets or instruct commit/push/merge.
- **SC-005**: The same item compiled for claude, codex, and generic carries identical safety guarantees.
- **SC-006**: An item missing scope info yields a refusal (non-zero exit, missing fields named), never
  an unscoped prompt.
- **SC-007**: Compilation runs with no network access and no credentials.
- **SC-008**: The same `(item, agent)` compiled twice produces byte-identical output (deterministic).

---

## Acceptance Criteria for This Feature *(mandatory)*

- **AC-001**: The required prompt structure is fully specified.
- **AC-002**: Default git rules and default stop conditions are specified and mandatory.
- **AC-003**: Per-agent rendering (claude/codex/generic) with identical safety is specified.
- **AC-004**: No-secrets and no-commit/push/merge guarantees are specified.
- **AC-005**: Refusal-on-missing-scope and unknown-agent fallback behaviors are specified.
- **AC-006**: CLI surface (`prompt`) and required output are defined.
- **AC-007**: Non-goals are explicit (execution, mutation, orchestration, library choice).
- **AC-008**: The spec is implementation-neutral on the templating engine (deferred to plan).
- **AC-009**: No production code, compiler code, `package.json`, or lockfile is created.

---

## Assumptions

- **Templating approach deferred** to plan/ADR. This spec mandates prompt *structure and safety*, not
  the rendering engine or language.
- **Agent set** for MVP is claude, codex, and generic; more renderers are additive later.
- **Prompt output** is text suitable for copy-paste; whether it is also written to a file is a
  plan-layer convenience, not a safety requirement.
- **Final-report fields** match the constitution's required final report and the queue item's
  `final_report.required[]`.
- **"Scope info"** an item must have to be compilable, mapped to the **real 005 `QueueItem`**: a
  non-empty `title` (→ the prompt's Objective), a non-empty `allowed_files`, and a non-empty
  `validation`. `forbidden_files` is **present-may-be-empty** (an empty list legitimately means
  "nothing forbidden beyond the default git rules" — the 005 deriver emits `[]`), so it is NOT part of
  the non-empty scope check. Items missing `title`/`allowed_files`/`validation` are not safely compilable.
