# Phase 0 Research: Derived Queue & Router

Decisions resolvable from the approved spec, the constitution, ADR-001/002/003, the shipped
002/003/004 packages, and the blueprint. Research inline (no subagents). Format: **Decision /
Rationale / Alternatives**.

---

## R1 — Scoring: transparent weighted-sum over the spec factors (resolves deferred formula → ADR-004)

- **Decision**: Compute each item's score as a **weighted sum of normalized factor values** over the
  spec's named factors (readiness, risk, blast radius, dependency status, validation availability,
  scope clarity, lock overlap, doc freshness). Weights are explicit constants. Recorded as **ADR-004**
  (a 005 task). The **selection ordering is already pinned by the spec** and is NOT a research
  decision: primary sort `score desc`; ties (equal score) → `blast_radius asc` → `risk asc` → `id asc`.
- **Rationale**: The spec defers the *formula/weights* but mandates the factors, determinism, and
  tiebreak. A weighted sum is the simplest transparent, testable, fully-deterministic scoring; every
  factor's contribution is inspectable (supporting the explicit-reason requirement, FR-005). No
  scheduling library needed (CLI-First, II; "no algorithm library" Non-Goal).
- **Alternatives considered**:
  - *Lexicographic priority tiers* — simpler but loses cross-factor tradeoff (a low-risk item with a
    large blast radius can't be balanced against a medium-risk small one). Rejected for v0.
  - *A constraint-solver / scheduler library* — explicit Non-Goal; overkill for one-task-by-default.

## R2 — Package boundary & evidence edge: new `packages/queue`, reuse upstream contracts

- **Decision**: New package `packages/queue`. It consumes a **written `risks.json`** (loaded +
  validated via `@aker-build/gates` `risksSchema`/`validateRisks`) and **`project-map.json`** (via
  `@aker-build/project-map` `loadJson` + `validate`), and reuses `@aker-build/scanner`'s read-only
  `io.ts` for output writes and the **optional** local diff read. It **imports `evidenceSchema` from
  `@aker-build/project-map`** for queue-item `source.evidence` and never redefines it (FR-003).
- **Rationale**: Mirrors the 004 evidence-edge pattern (consume written artifacts, centralize
  read-only io). Keeps `queue` decoupled from how gates/scan ran, makes the CLI "run queue/scan first"
  paths explicit, and lets 006 consume queue items directly. Optional diff/PR inputs are read-only and
  skipped when absent (never fabricated — FR-007, FR-011).
- **Alternatives considered**:
  - *Queue invokes gates/scanner internally* — couples the stages and blurs the boundary 006 relies
    on; the CLI can still chain `scan → gates → queue → route` for one-command UX without coupling.
  - *Diff via a new git wrapper* — rejected; reuse the scanner's audited read-only primitives.

## R3 — Schema home: queue/route schemas in `packages/queue`, evidence imported from 002

- **Decision**: Define `queueItemSchema`, `queueSchema`, and `routeDecisionSchema` (Zod) **in
  `packages/queue`**, importing `evidenceSchema` from `@aker-build/project-map`.
- **Rationale**: `queue.json` and `route.json` are new downstream artifacts owned by the producer.
  Importing the shared `evidenceSchema` satisfies FR-003 and inherits 002's `.strip()` no-secret
  guarantee (VII / FR-012).
- **Alternatives considered**: *Put schemas in gates or project-map* — overloads those packages with
  a third/second artifact's contract and creates back-edges. Rejected.

## R4 — Determinism (re-run stability)

- **Decision**: `queue.json` items are stably sorted by `id`; routing applies the pinned ordering
  (primary `score desc`; ties `blast_radius asc` → `risk asc` → `id asc`) with a **code-unit string
  comparison** for `id` (matching the 004 determinism fix — not `localeCompare`). No clock or
  non-deterministic field is in the compared `queue.json`/`route.json` surface.
- **Rationale**: FR-009 / SC-005 — two runs over unchanged input must produce the same decision. The
  pinned ordering + code-unit id comparison guarantees one canonical, platform-stable result. Directly
  reuses the lesson from the 004 implement phase (localeCompare vs `.sort()` mismatch).
- **Alternatives considered**: *localeCompare for id* — rejected; locale-dependent and the exact bug
  fixed in 004.

## R5 — Circular dependencies

- **Decision**: Build the `depends_on` graph and detect cycles via DFS with a visiting/visited
  coloring (or Kahn's algorithm leaving a residual). Items in a cycle are reported as `blocked` with a
  "circular dependency: A → B → A" reason; routing never loops.
- **Rationale**: FR-010 / SC-006 — circular deps must be detected and reported, not silently looped.
  Standard cycle detection is deterministic and dependency-free.
- **Alternatives considered**: *Assume acyclic* — rejected; the spec explicitly requires detection.

## R6 — Fixtures (test inputs)

- **Decision**: Tests build a **synthetic `project-map.json` + `risks.json` pair** (hand-authored or
  from a small real fixture run through scan+gates) that yields a mixed-readiness queue: a ready item,
  a dependency-blocked item, a lock-overlap-blocked item, and a circular-dependency pair. Where a real
  repo + diff is needed (lock-overlap), reuse the 003/004 copy-to-tempdir + `git init` helper.
- **Rationale**: SC-001…SC-006 need queues exhibiting each readiness/blocking case. Synthetic
  map+risks pairs are the cheapest way to exercise derivation + routing deterministically; the
  scanner/gates already have their own fixtures, so queue tests focus on the derivation/routing logic.
- **Alternatives considered**: *Only end-to-end via scan+gates* — slower and conflates upstream
  detection with routing logic; keep a thin synthetic layer for routing unit tests.

## R7 — CLI surface & "run X first" paths

- **Decision**: `aker-build queue [path] [--out <dir>]` derives `queue.json`; `aker-build route
  [path] [--out <dir>] [--stdout]` reads `queue.json` (deriving on the fly if absent is **not** done —
  it requires a produced queue) and writes `route.json` + prints the decision. Missing prerequisite
  (`risks.json` for queue, `queue.json` for route) → non-zero exit with a clear "run `aker-build
  gates`/`queue` first" message (mirroring 003/004 UX).
- **Rationale**: FR-016 + the clarified CLI surface; consistent with the 003 `map` / 004 `gates`
  "run X first" pattern.
- **Alternatives considered**: *`route` auto-derives the queue* — convenient but blurs the
  queue→route boundary and the explicit pipeline; the CLI can chain commands instead.
