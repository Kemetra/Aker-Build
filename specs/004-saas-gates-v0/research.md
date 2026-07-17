# Phase 0 Research: SaaS Gates v0

Decisions resolvable from the approved spec, the constitution, ADR-001/002, the shipped 002 + 003
packages, and the blueprint. Research inline (no subagents) — everything here is derivable from
existing artifacts. Format: **Decision / Rationale / Alternatives**.

---

## R1 — Rule engine: TypeScript-coded gate functions (resolves the spec's deferred choice → ADR-003)

- **Decision**: Each gate is a **plain TypeScript function** `(ctx: GateContext) => Finding[]`,
  registered in a central registry by id. No YAML-config rule format and no OPA/Rego engine in v0.
  Recorded as **ADR-003** (a 004 task, mirroring how 003 recorded ADR-002 via T001).
- **Rationale**: The spec defers this explicitly (Non-Goals: "Choosing a rule-engine library or
  language (decided at plan layer)"; Assumptions float "TypeScript rules + YAML config, OPA/Rego
  deferred"). v0 is signal-based detection over a known, small gate set (10 gates) — coded functions
  are the simplest thing that is fully testable, type-safe against the shared `evidenceSchema`, and
  free of a new dependency or config-language surface. This fits CLI-First (II) and the "no heavy
  scaffolding / OPA deferred" posture in the constitution's MVP constraints.
- **Alternatives considered**:
  - *YAML/JSON-config-driven rules* — declarative and editable without code, but needs a matcher
    DSL/interpreter to express signals like "route changed without OpenAPI update"; premature
    abstraction for 10 hand-written v0 gates. Revisit when rule authorship moves outside the team.
  - *OPA/Rego policy engine* — powerful, but an explicit Non-Goal and a heavyweight runtime/dependency
    for v0. Deferred per constitution.

## R2 — Evidence-consumption edge: consume `project-map.json`, reuse scanner `io.ts` for file reads

- **Decision**: `packages/gates` consumes an **already-written `project-map.json`** (loaded +
  validated via `@aker-build/project-map`'s `loadJson` + `validate`) for structural facts, and gets
  **file-level reads** by **reusing `@aker-build/scanner`'s read-only `io.ts` primitives**
  (`listFiles`, `fileExists`, `readFileSafe`). It does **not** re-run a full scan and does **not**
  introduce new fs primitives.
- **Rationale**: FR-008 requires gates to read the Project Map *and* repo evidence, read-only. Several
  v0 signals (e.g. "API route without auth guard", "query without tenant filter") need file-level
  content the map doesn't carry. Reusing the scanner's already-audited read-only io centralizes the
  no-mutation guarantee (VI) in one place instead of duplicating fs access. Consuming a written map
  (rather than invoking the scanner) keeps `gates` decoupled, makes the CLI "run scan first" path
  explicit, and keeps each command single-purpose.
- **Alternatives considered**:
  - *Gates invoke the scanner internally* — convenient one-shot UX, but couples gates to scanner
    orchestration and blurs the scan→gates boundary that 005/007 rely on. The CLI can still chain
    `scan` then `gates` for one-command UX without coupling the libraries.
  - *New fs primitives inside `packages/gates`* — rejected: duplicates the read-only surface and
    risks divergence from the audited scanner io.

## R3 — Schema home: `risks.json` schema lives in `packages/gates`, imports `evidenceSchema` from 002

- **Decision**: Define `findingSchema` and `risksSchema` (Zod) **in `packages/gates`**, **importing
  `evidenceSchema` from `@aker-build/project-map`** and never redefining the evidence shape.
- **Rationale**: 002's scope is the Project Map; `risks.json` is a distinct downstream artifact, so its
  schema belongs with the producer (`packages/gates`). Importing the shared `evidenceSchema` satisfies
  FR-003 ("MUST reuse the shared shape and MUST NOT define a divergent evidence/finding shape") and
  inherits 002's `.strip()` guarantee (a stray `secret` key can't survive — VII).
- **Alternatives considered**:
  - *Add the risks schema to `packages/project-map`* — would overload the project-map package with a
    second artifact's contract and create a back-edge from the map to the gate model. Rejected.

## R4 — Finding shape: Zod `discriminatedUnion` on `status`

- **Decision**: `findingSchema = z.discriminatedUnion("status", [...])` with three members:
  - `risk` → `severity: enum(low|medium|high|critical)` + `evidence: array(evidenceSchema).min(1)`.
  - `needs_verification` → `severity: null` + `evidence: array(evidenceSchema).min(1)`.
  - `not_applicable` → `severity: null` + `evidence: array(evidenceSchema)` (may be empty).
  All members carry `gate_id: string`. `risksSchema = z.object({ schema_version, findings: array(findingSchema) })`.
- **Rationale**: Encodes the spec's status-conditional invariants (FR-003, FR-013, Finding entity)
  directly in the type system — a `not_applicable` finding *cannot* carry a non-null severity, and a
  `risk` finding *cannot* be emitted without evidence. The discriminator makes "which fields are
  required" a compile-time + validation-time guarantee rather than a runtime convention.
- **Alternatives considered**:
  - *Flat object with all-optional fields + runtime checks* — looser; reintroduces the exact
    every-finding-needs-severity contradiction clarify removed. Rejected.

## R5 — Determinism (re-run stability)

- **Decision**: `findings[]` is **stably sorted** (by `gate_id`, then a stable secondary key —
  evidence `path` then `signal`); gates visit inputs in sorted order; no clock/non-deterministic field
  is included in the compared `risks.json` surface (any `generated_at` lives outside the canonical
  compared object, as 003 does for the map).
- **Rationale**: FR-007 / SC-005 — two runs over unchanged input must produce equivalent risk lists for
  diffing. Mirrors 003's R3 determinism approach exactly.
- **Alternatives considered**: *Gate-execution-order output* — rejected; order would depend on registry
  iteration and fs order, producing spurious diffs.

## R6 — v0 sample set (false-positive baseline, SC-003)

- **Decision**: The **v0 sample set** = the reused 003 scanner fixtures (`saas`, `monorepo`, `empty`)
  plus **per-gate clean/violation fixtures** added under `packages/gates/tests/fixtures/` for the gates
  under test. Fixtures are prepared as Git repos at test time using the **shared helper pattern from
  the 003 fix** (copy-to-tempdir + `git init`, cached per name) — no new test infrastructure.
- **Rationale**: SC-003 needs both known-good (0 false positives) and known-bad (true positive with
  evidence) repos. Reusing 003's fixtures + helper avoids reinventing fixture scaffolding and inherits
  the already-fixed nested-`.git` handling.
- **Alternatives considered**: *Synthetic in-memory repos* — rejected; the gates read real files via
  scanner io, so on-disk fixtures exercise the real read path.

## R7 — CLI surface & subset selection

- **Decision**: `aker-build gates [--gates TG-G4,TG-G5] [--out <dir>]`. With no `--gates`, run the
  full set; with `--gates`, run only the named ids (comma-separated, validated against the registry —
  unknown id → non-zero exit with a clear message). If no `project-map.json` exists in the out-dir,
  exit non-zero with a "run `aker-build scan` first" message (mirroring how `aker-build map`
  signals a missing map).
- **Rationale**: FR-006 + the clarified CLI surface. Reuses 003's `map` "run scan first" UX pattern for
  consistency.
- **Alternatives considered**: *Category-based selection (e.g. `--category security`)* — deferred;
  gate ids are stable and already defined, categories can layer on later without breaking the id path.
