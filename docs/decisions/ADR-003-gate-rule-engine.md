# ADR-003: Gate rule engine — TypeScript-coded gate functions

**Status**: Accepted
**Date**: 2026-06-18
**Context feature**: `004-saas-gates-v0`
**Supersedes/relates**: ADR-001 (tech stack), ADR-002 (CLI framework)

## Context

SaaS Gates v0 produce `risks.json` from the Project Map (002) + read-only repo evidence. The spec
(`004-saas-gates-v0`) deferred the rule-engine choice to the plan layer (Non-Goals: "Choosing a
rule-engine library or language (decided at plan layer)"; Assumptions float "TypeScript rules + YAML
config, OPA/Rego deferred"). v0 is a small, known set of ten gates (TG-G0…TG-G9) doing signal-based
detection — not exhaustive static analysis.

## Decision

Each gate is a **plain TypeScript function** `(ctx: GateContext) => Finding[]`, registered in a central
registry keyed by gate id. No YAML/JSON rule-config format and no OPA/Rego policy engine in v0.

## Rationale

- **Simplest thing that works**: ten hand-written gates are fully testable and type-safe against the
  shared `evidenceSchema` (imported from `@tenantguard/project-map`) without a new dependency or
  config-language surface.
- **Constitution alignment**: CLI-First (II) and the MVP "OPA/Rego deferred, no full static-analysis
  engine" posture. Evidence-Based Findings (III) is enforced at the type level by the discriminated
  `findingSchema`.
- **Reuse over reinvention**: gates read repo files through `@tenantguard/scanner`'s already-audited
  read-only `io.ts`, centralizing the No-Hidden-Mutation (VI) guarantee.

## Alternatives considered

- **YAML/JSON-config-driven rules** — declarative and editable without code, but needs a matcher
  DSL/interpreter to express signals like "route changed without OpenAPI update"; premature for ten
  v0 gates. Revisit when rule authorship moves outside the core team.
- **OPA/Rego policy engine** — powerful but an explicit Non-Goal and a heavyweight runtime/dependency
  for v0. Deferred per the constitution.

## Consequences

- New package `packages/gates` owns the gate registry, the v0 gate functions, and the `risks.json`
  Zod schema (importing `evidenceSchema` from 002, never redefining it).
- Adding a gate = adding a function + registry entry + fixtures/tests; no config plumbing.
- A future move to declarative rules (or OPA) is a later, separately-approved decision; v0's coded
  gates remain the reference behavior.
