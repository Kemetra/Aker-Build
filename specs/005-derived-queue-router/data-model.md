# Phase 1 Data Model: Derived Queue & Router

Entities, the `queue.json` / `route.json` shapes, derivation rules, and the scoring model. Grounded in
the spec's item contract and the **real exported** `evidenceSchema` (imported from
`@aker-build/project-map`). No code is created here.

---

## Shared Evidence Object (imported, NOT redefined)

Queue-item `source.evidence` uses `@aker-build/project-map`'s `evidenceSchema`
(`{type, path, line?, signal, confidence}`) verbatim (FR-003). `.strip()` keeps secrets out (FR-012).

---

## Entities

### QueueItem

| Field | Type | Notes |
|-------|------|-------|
| `id` | string | Stable within a run, e.g. `Q-004`. |
| `title` | string | Short description. |
| `status` | `ready` \| `blocked` \| `done` | v0 deriver emits `ready` / `blocked` only; `done` reserved (future/external). |
| `type` | `implementation` \| `test` \| `docs` \| `migration` \| `chore` | Derived from the source finding's gate. |
| `source` | `{ evidence: Evidence[] }` | The finding(s)/file(s) justifying the item (≥1 for finding-derived items). |
| `priority` | `low` \| `medium` \| `high` \| `critical` | Triage priority (from finding severity). |
| `risk` | `low` \| `medium` \| `high` \| `critical` | Risk of doing the work. |
| `depends_on` | `string[]` | Other item ids that must complete first. |
| `lock_scope` | `{ files: string[] }` | Files the item locks while in flight. |
| `allowed_files` | `string[]` | Files the item may touch. |
| `forbidden_files` | `string[]` | Files the item must not touch. |
| `gates` | `string[]` | Applicable TG-Gn gate ids. |
| `validation` | `string[]` | Commands that verify the work. |
| `stop_conditions` | `string[]` | When the agent/human must stop. |
| `final_report` | `{ required: string[] }` | Fields the final report must include. |

Validation rules:
- A finding-derived item MUST have ≥1 `source.evidence` (FR-003).
- `status` and `type` MUST be in their enums (FR-014).
- A finding with no safe scoped action is emitted as `status: blocked`, never `ready` (US1 #3).

### Queue (`queue.json`)

| Field | Type | Notes |
|-------|------|-------|
| `schema_version` | number | Mirrors 002/004 convention. |
| `items` | `QueueItem[]` | Stably sorted by `id` (R4). |

### LockScope

The file set an item reserves while in flight (`lock_scope.files[]`). Two items **overlap** when their
lock-scope file sets intersect; an item also overlaps the **current diff** when its lock scope
intersects changed files (optional input — skipped when no diff).

### RouterDecision (`route.json`)

| Field | Type | Notes |
|-------|------|-------|
| `next` | `{ id, title, reason: string[] }` \| `null` | The single chosen item; `null` when none safe. |
| `blocked` | `{ id: string, reason: string }[]` | Items that cannot run, with reasons. |
| `no_safe_task_reasons` | `string[]` | Why nothing was selectable; empty when `next` is non-null. |

---

## Derivation rules (findings → queue items)

| Source | → Item |
|--------|--------|
| A `status: risk` finding (TG-Gn) | one QueueItem: `type` from the gate (e.g. G3→`migration`, G2→`docs`/`test`, others→`implementation`); `priority`/`risk` from severity; `source.evidence` = the finding's evidence; `gates` = [gate_id]; `lock_scope`/`allowed_files` seeded from evidence paths; `validation`/`stop_conditions`/`final_report` from gate defaults. |
| A `needs_verification` finding | a `blocked` item (no safe scoped action yet) with the finding as evidence (US1 #3). |
| A `not_applicable` finding | no item (nothing to do). |

An item is `ready` iff: all `depends_on` are satisfiable (no unmet/circular dep) AND its gate is not
failing in a way that blocks it AND (when a diff is present) its lock scope does not overlap the diff.
Otherwise `blocked` with a reason.

## Scoring model (ADR-004; R1)

`score = Σ (weightᵢ × normalizedFactorᵢ)` over the spec factors: readiness, risk (inverse — lower
risk scores higher), blast radius (inverse), dependency status, validation availability, scope clarity,
lock overlap (inverse), doc freshness. Weights are explicit constants in `score.ts`; each factor's
contribution is recorded so the router can emit an explicit `reason[]` (FR-005).

## Selection ordering (pinned by spec; R4)

Primary sort `score desc`; ties (equal score) broken by `blast_radius asc` → `risk asc` → `id asc`
(code-unit comparison for `id`). Only `ready` items are selectable; if none, `next: null` +
`no_safe_task_reasons[]` (FR-007).

## Circular dependencies (R5)

The `depends_on` graph is checked for cycles (DFS coloring). Items in a cycle are `blocked` with a
"circular dependency: A → B → A" reason; routing never loops (FR-010, SC-006).
