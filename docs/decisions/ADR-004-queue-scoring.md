# ADR-004: Queue scoring — transparent weighted-sum

**Status**: Accepted
**Date**: 2026-06-18
**Context feature**: `005-derived-queue-router`
**Relates**: ADR-001 (tech stack), ADR-002 (CLI framework), ADR-003 (gate rule engine)

## Context

The router selects one next-safest task from the derived queue. The spec (`005-derived-queue-router`)
defers the *scoring formula/weights* to the plan layer, while pinning the **factors** (readiness, risk,
blast radius, dependency status, validation availability, scope clarity, lock overlap, doc freshness),
**determinism**, and the **selection ordering** (primary `score desc`; ties `blast_radius asc` →
`risk asc` → `id asc`).

## Decision

Score each item as a **weighted sum of normalized factor values** over the spec's named factors, with
explicit weight constants. Each factor's contribution is recorded so the router can emit an explicit
`reason[]`. Selection applies the spec's pinned ordering with a **code-unit** comparison for `id`
(not `localeCompare`).

## Rationale

- **Transparent & testable**: every factor's contribution is inspectable, directly supporting the
  explicit-reason requirement (FR-005) and deterministic output (FR-009 / SC-005).
- **No new dependency**: a weighted sum needs no scheduling/solver library (CLI-First, II; the
  "no algorithm library" Non-Goal).
- **Reuses a hard-won lesson**: code-unit `id` comparison avoids the `localeCompare` vs `.sort()`
  determinism mismatch fixed during the 004 implementation.

## Alternatives considered

- **Lexicographic priority tiers** — simpler but cannot balance cross-factor tradeoffs (a low-risk
  large-blast item vs a medium-risk small one). Rejected for v0.
- **Constraint solver / scheduler library** — an explicit Non-Goal; overkill for one-task-by-default.

## Consequences

- `packages/queue/src/score.ts` holds the weights + normalization; `route.ts` applies the pinned
  ordering. Weights are tunable constants, not config (config-driven rules are a later decision).
- Adding/retuning a factor = editing `score.ts` + its test; no plumbing.
- A future move to configurable weights or N-task routing is a separate, approved decision.
