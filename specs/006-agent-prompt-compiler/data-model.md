# Phase 1 Data Model: Agent Prompt Compiler

The prompt's required sections, the **section → real-`QueueItem`-field mapping**, the renderer contract,
and the invariant default blocks. Grounded in the **real exported `QueueItem`** from
`@tenantguard/queue` (`packages/queue/src/types.ts`), not the spec's prose. No code is created here.

---

## Input: the real 005 `QueueItem` (verbatim fields)

```text
id, title, status, type,
source: { evidence: Evidence[] },          // Evidence = 002 {type,path,line?,signal,confidence}
priority, risk, depends_on[],
lock_scope: { files: string[] },
allowed_files[], forbidden_files[],         // forbidden_files is [] by default from the 005 deriver
gates[], validation[], stop_conditions[],
final_report: { required: string[] }
```

**There is no `objective` field.** The prompt's Objective is the item's `title`.

---

## Section → field mapping (the core contract)

| Prompt section (required) | Source | Notes |
|---------------------------|--------|-------|
| **Objective** | `title` | The title IS the objective (no separate field). |
| **Repo-state verification** | compiler constant | Inject: "run `git status`; confirm clean/expected before acting." |
| **Context** | `source.evidence[]` | Render each evidence `{type, path, line?, signal}` as a bullet. Secret-like content excluded/flagged (FR-007). |
| **Scope** | `type` + `title` (+ `gates`) | A one-line scope statement; the gates the item addresses. |
| **Allowed files** | `allowed_files[]` | Listed explicitly (FR-002). Must be non-empty (scope check). |
| **Forbidden files** | `forbidden_files[]` | Listed explicitly; **may be empty** → render "(none beyond the default git rules)". |
| **Validation commands** | `validation[]` | Listed explicitly. Must be non-empty (scope check). |
| **Git rules** | compiler constant (`DEFAULT_GIT_RULES`) | Invariant across renderers (FR-003/FR-015). |
| **Stop conditions** | `stop_conditions[]` ∪ `DEFAULT_STOP_CONDITIONS` | Item-specific + the spec defaults; defaults invariant. |
| **Final report format** | `final_report.required[]` (fallback `FINAL_REPORT_FIELDS`) | Constitution's required final report. |

---

## Scope-completeness check (FR-009)

An item is **compilable** iff:

```text
title         is a non-empty string
allowed_files is a non-empty array
validation    is a non-empty array
```

`forbidden_files` is **present-may-be-empty** and is NOT part of the check (empty = "nothing forbidden
beyond the default git rules"). If any required field is missing/empty, the compiler **refuses**:
non-zero exit + a message naming the missing field(s) — never a partial prompt (FR-009, SC-006).

---

## Invariant default blocks (single source of truth — `defaults.ts`)

`DEFAULT_GIT_RULES` and `DEFAULT_STOP_CONDITIONS` are the exact lists from the spec's
"Default git rules" / "Default stop conditions". `FINAL_REPORT_FIELDS` = files changed, summary of
changes, tests run and results, evidence used, risks/gaps, git status, next safe action. These blocks
are **byte-identical across all renderers** (FR-015) — renderers reference the shared constants, never
re-author them.

---

## Renderer contract

| Aspect | Across claude / codex / generic |
|--------|----------------------------------|
| Section set + order | **Identical** |
| Default git rules / stop conditions / final-report | **Byte-identical** |
| Allowed/forbidden files, validation, context, objective | **Identical content** (from the item) |
| Presentation (heading style, framing preamble) | **May differ** per agent convention |
| Unknown agent | Falls back to **generic** + a one-line note (FR-010) |

This makes SC-005 mechanically testable: assert the invariant blocks are byte-identical across the
three renderers while only presentation differs.

## Determinism

For the same `(item, agent)`, output is byte-identical (fixed section order; no clock/random/locale)
(FR-016, SC-008).

## Entities

- **CompiledPrompt**: `{ id, agent, markdown }` — the rendered text (+ which agent it was rendered for).
- **ScopeGap**: `{ missing: string[] }` — the fields a refused item lacked (drives the refusal message).
- **AgentName**: `"claude" | "codex" | "generic"` (unknown input → `generic` + note).
