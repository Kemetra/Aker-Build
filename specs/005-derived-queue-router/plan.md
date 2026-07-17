# Implementation Plan: Derived Queue & Router

**Branch**: `005-derived-queue-router` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-derived-queue-router/spec.md`

## Summary

Turn evidence into action. A new package `packages/queue` **derives `queue.json`** — safe, scoped work
items — from the Project Map (002) and gate findings (004, `risks.json`), then **routes** to exactly
one next-safest task (`route.json`, also printed) with an explicit reason and a blocked list. v0 is
deterministic, read-only, local-first, secret-free, and domain-neutral. Exposed via `aker-build queue`
and `aker-build route`.

**Technical approach** (decided at this plan layer):

1. **Scoring = a transparent weighted-sum over the spec's named factors** (readiness, risk, blast
   radius, dependency status, validation availability, scope clarity, lock overlap, doc freshness),
   resolving the spec's deferred formula. Recorded as **ADR-004** (a 005 task, mirroring ADR-002/003).
   The **selection ordering is already pinned by the spec**: primary sort `score desc`, ties broken by
   `blast_radius asc` → `risk asc` → `id asc`. See Research R1.
2. **Package boundary**: new `packages/queue` consumes a written `risks.json` (validated via
   `@aker-build/gates` `risksSchema`) + `project-map.json` (validated via `@aker-build/project-map`),
   and reuses `@aker-build/scanner`'s read-only `io.ts` for optional diff/PR evidence + output writes.
   It **imports `evidenceSchema` from `@aker-build/project-map`** for queue-item `source.evidence`
   (never redefined, FR-003). See Research R2.
3. **Schema home**: the `queueItemSchema` / `queueSchema` / `routeDecisionSchema` (Zod) live in
   `packages/queue`. See Research R3.

**No production code is created by this plan.** Implementation begins only after `plan.md` + `tasks.md`
are reviewed (AC-009; constitution §Development Workflow).

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (per ADR-001).
**Primary Dependencies**: `@aker-build/project-map` (map contract + `evidenceSchema` + `validate`);
  `@aker-build/gates` (`risksSchema` + `Finding` types — the queue's evidence source);
  `@aker-build/scanner` (read-only `io.ts`, optional diff via git read); **Commander** (CLI, ADR-002);
  **Zod** (queue/route schemas). No network client.
**Storage**: Reads `project-map.json` + `risks.json` from the out-dir; optionally reads the local diff
  (read-only). Writes `queue.json` + `route.json` to the **designated out-dir outside tracked source**
  (default `./.aker-build/`, FR-016) — never mutates scanned files.
**Testing**: Vitest. Fixtures = a synthetic map+risks pair producing a mixed-readiness queue (ready,
  blocked-by-dep, blocked-by-lock-overlap, circular-dep), reusing the 003/004 fixture-prep helper
  pattern where a real repo is needed.
**Target Platform**: Local dev machine / CI runner; Node CLI. No network.
**Project Type**: CLI tool + supporting library (monorepo packages).
**Performance Goals**: Derive + route over a typical repo's findings in well under a second; no hard
  throughput target for MVP.
**Constraints**: Deterministic (FR-009, SC-005); read-only incl. optional diff (FR-011); no
  network/credentials (FR-011, SC-007); no secrets (FR-012, SC-007); domain-neutral (FR-013); every
  finding-derived item traces to evidence (FR-003, SC-002); circular deps detected (FR-010, SC-006).
**Scale/Scope**: Single-task-by-default routing; one derived queue per run; no cross-run persistence
  (Non-Goal).

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.* Against the 8 named principles.

| Principle | Relevance | Status |
|-----------|-----------|--------|
| I. Source Truth First | Queue/route derive only from current map + findings (+ optional diff); "no safe task" is explicit, never an arbitrary pick (FR-007). | ✅ Pass |
| II. CLI First | Delivered as `aker-build queue` / `route`; local, no network/credentials (FR-011). | ✅ Pass |
| III. Evidence-Based | Every finding-derived item traces to its source evidence; reasons cite why (FR-003, FR-005, SC-002). | ✅ Pass |
| IV. Spec-Compatible | Operates on any scanned repo's map + risks; no methodology requirement. | ✅ Pass |
| V. Agent Safety | Queue items carry scope, allowed/forbidden files, gates, validation, stop conditions — the raw material 006 compiles into safe prompts. | ✅ Pass |
| VI. No Hidden Mutation | **Read-only** on the scanned repo incl. optional diff; output only to the out-dir; no execute/commit/merge (Non-Goals). | ✅ Pass |
| VII. No Secrets | Queue items + router output never contain secrets (FR-012, SC-007); inherits 002/004 secret-safe evidence. | ✅ Pass |
| VIII. Clean Extraction | Generalized routing rules only — no Retail Tower / ERPNext / POS specifics (FR-013). | ✅ Pass |

**No gate violations — no Complexity Tracking entries required.** Docs-first: this plan creates no
code; implementation waits on reviewed `plan.md` + `tasks.md`.

## Project Structure

### Documentation (this feature)

```text
specs/005-derived-queue-router/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (scoring formula, package boundary, schema home, determinism, circular deps, fixtures)
├── data-model.md        # Phase 1 — QueueItem, Queue, RouterDecision, LockScope, derivation + scoring rules
├── quickstart.md        # Phase 1 — planned `queue`/`route` usage + acceptance mapping
├── contracts/
│   ├── queue-route-cli.md   # Phase 1 — `queue`/`route` command contract (args, exit codes, output)
│   ├── queue-json.md        # Phase 1 — queue.json shape contract (item contract, enums, evidence reuse)
│   └── route-json.md        # Phase 1 — route.json shape (next nullable + blocked[] + no_safe_task_reasons[])
├── checklists/
│   └── requirements.md   # (from /speckit.specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root) — PLANNED, not created by this command

```text
packages/queue/               # queue derivation + router + schemas (created at implementation time)
├── src/
│   ├── schema.ts            # Zod: queueItemSchema, queueSchema, routeDecisionSchema; imports evidenceSchema from 002
│   ├── types.ts             # QueueItem, Queue, RouterDecision, LockScope, ScoreFactors types
│   ├── context.ts           # load+validate project-map.json + risks.json; wire scanner io (optional diff)
│   ├── derive.ts            # findings (risk) + map → queue items (id, scope, gates, validation, stop conds)
│   ├── deps.ts              # dependency graph + circular-dependency detection (FR-010)
│   ├── score.ts             # weighted-sum over the spec factors (ADR-004); pure + testable
│   ├── route.ts             # select one next (score desc; tie: blast_radius/risk/id); blocked[]; no_safe_task_reasons[]
│   ├── io.ts                # write queue.json / route.json to out-dir (delegates reads to scanner io)
│   └── index.ts             # public surface: deriveQueue(opts), route(opts)
└── tests/
    ├── derive-contract.test.ts       # every item carries the full contract + enums (SC-001)
    ├── evidence-trace.test.ts        # finding-derived items trace to source evidence (SC-002)
    ├── blocked-derivation.test.ts    # finding with no safe scoped action → blocked, not ready (US1 #3)
    ├── route-one.test.ts             # exactly one next + reason; blocked[] with reasons (SC-003, SC-004)
    ├── no-safe-task.test.ts          # none safe → next:null + no_safe_task_reasons[] (FR-007)
    ├── circular-deps.test.ts         # circular dependency detected + reported, not looped (SC-006)
    ├── determinism.test.ts           # two runs → same decision; tiebreak ordering (SC-005)
    ├── lock-overlap.test.ts          # lock-scope overlap with diff → deprioritized/blocked (US3)
    └── secrets.test.ts               # no secret in queue/route output (SC-007)

packages/cli/                 # extend the existing aker-build CLI (no new package)
├── src/commands/queue.ts     # `aker-build queue` → deriveQueue → write queue.json
├── src/commands/route.ts     # `aker-build route` → route → write route.json + print decision
└── tests/cli.queue-route.test.ts  # commands produce valid outputs; exit codes; run-queue-first path
```

**Structure Decision**: A new `packages/queue` library (pure derivation + scoring + routing + schemas)
plus thin new commands in the **existing** `packages/cli`. `packages/queue` depends on
`@aker-build/project-map`, `@aker-build/gates`, and `@aker-build/scanner`, keeping the read-only
guarantee centralized and letting 006 (prompt compiler) consume queue items + the router decision
directly. This plan **does not create** any of the above; the split is confirmable at `/speckit-tasks`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
