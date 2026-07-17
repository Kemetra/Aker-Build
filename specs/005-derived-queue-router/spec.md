# Feature Specification: Derived Queue & Router

**Feature Branch**: `005-derived-queue-router`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "Generate queue items and select one next safest task. Depends on 001, 002, 003, 004. Docs only; no production code."

**Depends on**: `001-product-foundation`, `002-project-map-schema`, `003-cli-scanner`, `004-saas-gates-v0`
**Blocks**: `006-agent-prompt-compiler` (prompts are compiled from queue items)

---

## Purpose *(mandatory)*

This feature turns evidence into action. It **derives a queue** of safe, scoped work items from the
Project Map (002) and gate findings (004), then **routes** to exactly one next-safest task by default —
with the reason it was chosen and what is blocked.

This spec defines the **queue item contract** and the **router behavior** (inputs, scoring factors,
output), not the scheduling internals or language.

---

## Clarifications

### Session 2026-06-18

- Q: What are the canonical `status` and `type` enums for a queue item? → A: `status` ∈ `ready` / `blocked` / `done` (the v0 deriver emits only `ready` / `blocked`; `done` is **reserved** for future/external marking, not emitted by the deriver); `type` ∈ `implementation` / `test` / `docs` / `migration` / `chore`.
- Q: What shape does the router output when no task is safe? → A: `next` is always present and nullable (`next: null` when none safe), plus a `no_safe_task_reasons: string[]` field — a single stable shape, never a missing key.
- Q: How does the router obtain "current local diff" / PR state in a local-first, read-only MVP? → A: via `@aker-build/scanner`'s read-only git/fs primitives; diff and PR state are **optional inputs** — when absent, the factors that need them are skipped (never fabricated), consistent with FR-007.
- Q: What is the deterministic selection ordering? → A: primary sort `score desc`; ties (equal score) broken by `blast_radius asc` → `risk asc` → `id asc` (lowest blast radius, then lowest risk, then id as the final stable key).
- Q: Where are `queue.json` and the router decision written? → A: to the designated out-dir — `.aker-build/queue.json` and `.aker-build/route.json` (same convention as 003/004); `route` also prints the decision to stdout.

---

## User Scenarios & Testing *(mandatory)*

"User" is a developer/team lead asking "what is safe to do next?"

### User Story 1 - Derive a queue from evidence (Priority: P1)

A developer generates `queue.json` from the map and findings; each item is explicit and safe for
agent handoff (scope, gates, validation, stop conditions).

**Why this priority**: A derived, evidence-based queue replaces stale manual todos — the core value
of this feature. Prompts (006) are compiled from these items.

**Independent Test**: From a map + risk list, generate the queue and confirm each item carries id,
type, evidence, dependencies, lock scope, allowed/forbidden files, gates, validation, and stop
conditions.

**Acceptance Scenarios**:

1. **Given** a map and risk list, **When** the queue is derived, **Then** `queue.json` is produced.
2. **Given** any queue item, **When** inspected, **Then** it has an id, status, type, evidence,
   dependencies, lock scope, allowed/forbidden files, applicable gates, validation, and stop
   conditions.
3. **Given** a finding with no safe scoped action, **When** the queue is derived, **Then** it is
   represented as blocked rather than as a ready item.

### User Story 2 - Route to one next safest task (Priority: P1)

A team lead routes and gets exactly one next-safest item by default, with an explicit reason, plus a
list of blocked items and why.

**Why this priority**: The single, justified recommendation is the headline behavior — it is what
"next safest task" means.

**Independent Test**: From a queue with mixed readiness, route and confirm exactly one next item is
returned with a reason, and blocked items are listed with blocking reasons.

**Acceptance Scenarios**:

1. **Given** a derived queue, **When** routing runs, **Then** exactly one next-safest task is returned
   by default, with a reason.
2. **Given** an item with unmet dependencies or a failing gate, **When** routing runs, **Then** it is
   listed as blocked with the blocking reason.
3. **Given** no item is safe, **When** routing runs, **Then** the output is an explicit "no safe next
   task" with reasons — never an arbitrary pick.

### User Story 3 - Respect lock scopes and blast radius (Priority: P2)

The router avoids recommending items whose lock scopes overlap in-flight work or whose blast radius is
large relative to safer alternatives.

**Why this priority**: Safety is the point — overlapping or high-blast-radius work is what causes
conflicts and breakage.

---

### Edge Cases

- **Empty queue**: routing returns "no tasks" cleanly.
- **All items blocked**: routing returns "no safe next task" with per-item reasons.
- **Circular dependencies**: detected and reported, not silently looped.
- **Ties in scoring** (equal score): broken deterministically by `blast_radius asc` → `risk asc` →
  `id asc`, so output is reproducible.
- **Lock-scope overlap with current diff**: the overlapping item is deprioritized/blocked.

---

## Queue Item Contract *(mandatory)*

Each queue item is explicit and safe for agent handoff:

```text
id              stable identifier (e.g. Q-004)
title           short description
status          ready | blocked | done
type            implementation | test | docs | migration | chore
source.evidence the finding(s)/file(s) that justify the item
priority        triage priority
risk            risk level of doing the work
depends_on[]    other item ids that must complete first
lock_scope.files[]   files this item locks while in flight
allowed_files[]      files the item may touch
forbidden_files[]    files the item must not touch
gates[]         applicable TG-Gn gates
validation[]    commands that verify the work
stop_conditions[]    when the agent/human must stop
final_report.required[]   fields the final report must include
```

---

## Router Behavior *(mandatory)*

**Inputs**: current project map; risk findings; queue items; dependencies; lock scopes; failed gates.
**Optional inputs** (read via `@aker-build/scanner`'s read-only git/fs primitives): current local
diff; current PR state. When an optional input is absent, the scoring factors that depend on it are
skipped (never fabricated), consistent with FR-007.

**Scoring factors**: readiness; risk; blast radius; dependency status; validation availability; scope
clarity; lock overlap; documentation freshness.

**Output**:

```text
next:    the single chosen item (id, title, reason[]) — always present, null when no task is safe
blocked: list of { id, reason } for items that cannot run
no_safe_task_reasons: string[] — why no item was selectable (empty when next is non-null)
```

By default the router selects exactly one `next`. When no item is safe, `next` is `null` and
`no_safe_task_reasons` explains why — never an arbitrary pick. Selection is a primary sort by
`score desc`; ties (equal score) are broken deterministically by `blast_radius asc` → `risk asc` →
`id asc`.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST derive `queue.json` from the Project Map and gate findings.
- **FR-002**: Each queue item MUST carry the full item contract above (id, status, type, evidence,
  dependencies, lock scope, allowed/forbidden files, gates, validation, stop conditions, final-report
  requirements).
- **FR-003**: Items derived from findings MUST trace to their source evidence.
- **FR-004**: The router MUST select exactly one next-safest task by default.
- **FR-005**: The router MUST output an explicit reason for the chosen task.
- **FR-006**: The router MUST list blocked items with blocking reasons.
- **FR-007**: When no item is safe, the router MUST return an explicit "no safe next task" with
  reasons, never an arbitrary pick.
- **FR-008**: The router MUST consider dependencies, lock-scope overlap, and blast radius in selection.
- **FR-009**: Routing MUST be deterministic for unchanged input: a primary sort by `score desc`, with
  ties (equal score) broken by `blast_radius asc` → `risk asc` → `id asc`.
- **FR-010**: Circular dependencies MUST be detected and reported.
- **FR-011**: Queue/router MUST run with no network access and no credentials (local-first). Optional
  diff/PR inputs MUST be read read-only (via the scanner primitives) and are skipped when absent.
- **FR-012**: Queue items and router output MUST NOT contain secrets.
- **FR-013**: Queue/router MUST be domain-neutral — no Retail Tower/ERPNext/POS specifics.
- **FR-014**: A queue item's `status` MUST be one of `ready` / `blocked` / `done` (the v0 deriver
  emits only `ready` / `blocked`; `done` is reserved for future/external marking); its `type` MUST be
  one of `implementation` / `test` / `docs` / `migration` / `chore`.
- **FR-015**: The router output MUST use a single stable shape: `next` always present (nullable),
  `blocked[]`, and `no_safe_task_reasons[]` (empty when `next` is non-null).
- **FR-016**: `queue.json` and the router decision (`route.json`) MUST be written to the designated
  out-dir (`.aker-build/`, same convention as 003/004); writing there is not a modification of the
  scanned repo's tracked source. `route` also prints the decision to stdout.

### Key Entities

- **Queue Item**: a safe, scoped unit of work (full contract above).
- **Queue** (`queue.json`): the derived collection of items.
- **Router Decision** (`route.json`): `next` (the chosen item with `id`, `title`, `reason[]`; `null`
  when none safe) + `blocked[]` ({id, reason}) + `no_safe_task_reasons[]`.
- **Lock Scope**: the file set an item reserves while in flight.

---

## CLI Surface *(mandatory)*

```text
aker-build queue       derive queue.json from map + findings (→ .aker-build/queue.json)
aker-build route       select one next-safest task (with reason) + list blocked items
                        (→ .aker-build/route.json; also printed to stdout)
```

---

## Required Outputs *(mandatory)*

```text
.aker-build/queue.json   derived queue items (each carrying the full item contract)
.aker-build/route.json   the router decision: next (nullable) + blocked[] + no_safe_task_reasons[]
                          the chosen next item with reason is also printed to stdout
```

---

## Non-Goals *(mandatory)*

```text
- Compiling the agent prompt for the chosen task (that is 006).
- Executing the task or any agent (never in MVP).
- Auto-committing, auto-merging, or mutating GitHub state.
- A multi-task scheduler / parallel work planner (MVP routes one task by default).
- Persisting queue history across runs (later/dashboard concern).
- Choosing a scheduling/algorithm library or language (decided at plan layer).
- Retail Tower / ERPNext / POS-specific routing rules.
```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a map + risk list, the system produces a `queue.json` where 100% of items carry the
  full item contract.
- **SC-002**: 100% of items derived from findings trace to source evidence.
- **SC-003**: The router returns exactly one next-safest task by default (or an explicit "no safe
  task"), with a reason, in 100% of runs.
- **SC-004**: 100% of blocked items include a blocking reason.
- **SC-005**: Two routing runs over unchanged input produce the same decision (deterministic tiebreak).
- **SC-006**: Circular dependencies are detected and reported rather than looping.
- **SC-007**: 0 secrets appear in the queue or router output; runs need no network/credentials.

---

## Acceptance Criteria for This Feature *(mandatory)*

- **AC-001**: The queue item contract is fully specified.
- **AC-002**: Router inputs, scoring factors, and output shape are specified.
- **AC-003**: One-task-by-default, explicit-reason, and blocked-with-reasons behaviors are specified.
- **AC-004**: "No safe task," circular-dependency, and deterministic-tiebreak behaviors are specified.
- **AC-005**: Read-only/local-first/no-secrets/domain-neutral guarantees are specified.
- **AC-006**: CLI surface (`queue`, `route`) and required outputs are defined.
- **AC-007**: Non-goals are explicit (prompt compile, execution, mutation, scheduler, persistence).
- **AC-008**: The spec is implementation-neutral on algorithm/library (deferred to plan).
- **AC-009**: No production code, queue/router code, `package.json`, or lockfile is created.

---

## Assumptions

- **Scoring algorithm and weights deferred** to plan/ADR. This spec mandates the *factors* and
  *behavior* (one task, deterministic, evidence-traced), not a specific formula.
- **Selection ordering** is pinned (clarified 2026-06-18): primary sort `score desc`; ties (equal
  score) broken by `blast_radius asc` → `risk asc` → `id asc`. The scoring *formula/weights* remain
  deferred to plan; the deterministic ordering does not.
- **"Blast radius"** is the breadth of files/surfaces an item affects, derived from lock scope and
  evidence; precise measurement is a plan-layer detail.
- **Single-task default** is intentional; a future flag for N tasks is out of MVP scope.
- **Queue item ids** are stable within a run; cross-run id stability is a later concern.
