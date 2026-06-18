# Phase 0 Research: Project Map Schema

All Technical Context items were resolvable from the approved spec, the blueprint, and the
constitution — no open `NEEDS CLARIFICATION` remained. Research was conducted inline (no subagents;
per the project's agent-dispatch rule). Each decision below: **Decision / Rationale / Alternatives**.

---

## R1 — Schema definition + validation library

- **Decision**: Use **Zod** (TypeScript) as the single source of the schema; derive a **JSON Schema**
  contract artifact from it for documentation/interop.
- **Rationale**: Zod gives field-level error paths (satisfies FR-008: "names the offending field and
  its location") and a `.passthrough()`/tolerant mode for unknown fields (FR-007 forward
  compatibility). It is the blueprint's named choice (tech-stack table) and keeps one authoritative
  definition instead of hand-syncing a separate validator and types. TypeScript types are inferred
  from the schema, so consumers (003–007) get compile-time shapes for free.
- **Alternatives considered**:
  - *JSON Schema (ajv) as the source of truth* — interoperable, but no inferred TS types and weaker
    DX for the rich conditional rule (null-when-not-detected). Kept as a *derived* artifact instead.
  - *Hand-written validators* — rejected: error-prone, duplicates types, no tolerant-read story.

## R2 — JSON canonical, YAML convenience

- **Decision**: JSON (`project-map.json`) is canonical and authoritative; YAML (`project-map.yaml`)
  is an optional human-authoring/inspection form parsed to the **same logical object** before
  validation. Both validate against the same schema (FR-009, SC-005).
- **Rationale**: Spec Assumptions state "JSON is canonical, YAML is convenience." Validating the
  parsed object (not the text) guarantees identical meaning and a lossless round-trip.
- **Alternatives considered**: *YAML canonical* — rejected; JSON is the machine contract consumers
  read. *Two separate schemas* — rejected; would risk divergence (violates "identical meaning").

## R3 — `tenant_model.status` representation (honesty over fabrication)

- **Decision**: Required `status` enum `detected | not_detected | unknown | not_applicable`; when
  `status !== "detected"`, `strategy` and `tenant_key` MUST be `null` (or `strategy: "unknown"`),
  enforced by a conditional (Zod `superRefine`) rule.
- **Rationale**: Directly realizes FR-004a and Principle I (Source Truth First): a non-SaaS or
  single-tenant or undeterminable repo is represented honestly, never with a guessed strategy.
- **Alternatives considered**: *Omit tenant_model when absent* — rejected; conflates "no tenancy"
  with "not scanned." *Free-form string* — rejected; not machine-checkable for the honesty rule.

## R4 — Shared Evidence Object `{type, path, line, signal, confidence}`

- **Decision**: Define once in this feature as the normative shape reused by gates (004), queue
  (005), prompts (006), reviewer (007). `line` optional/nullable; `path` nullable (path-less
  evidence like failed commands/CI); `confidence` carried on the evidence object (single home).
- **Rationale**: FR-004b + Principle III. One shape prevents each downstream spec inventing its own
  finding/evidence structure (the exact drift the 004 cleanup removed). The `type` enum spans repo,
  diff, PR, CI, missing-artifact, and failed-command evidence so all downstream needs are covered.
- **Alternatives considered**: *Per-spec evidence shapes* — rejected; causes incompatible findings.
  *Confidence on the finding, not the evidence* — rejected; created two ambiguous confidences (the
  004 cleanup consolidated to one).

## R5 — Versioning & forward/backward compatibility

- **Decision**: Integer `version` (starts at `1`). **Additive** changes (new optional fields, new
  enum values) are backward compatible and do not require a bump beyond convention; **removals,
  renames, and redefinitions** are breaking and require a major bump. Consumers read tolerantly:
  unknown fields are ignored (or surfaced as a warning), never a hard failure (FR-006, FR-007).
- **Rationale**: The map is read by many specs; a stated policy is what makes the dependency chain
  safe to evolve (User Story 2 / SC-003 / SC-004).
- **Alternatives considered**: *Semver string version* — heavier than needed for a single-document
  schema; integer is sufficient and matches the spec example (`version: 1`). Revisit if needed.

## R6 — Field-level validation errors

- **Decision**: `validate(map)` returns `{ ok: boolean, errors: Array<{ path, message }> }`; each
  error names the offending field path (e.g. `tenant_model.strategy`) and a human message. Maps to
  Zod's `issue.path`.
- **Rationale**: FR-008 / SC-002 require failures to name the specific missing/invalid field. A
  structured error list (not a thrown string) lets the CLI render clear, evidence-style messages.
- **Alternatives considered**: *Throw on first error* — rejected; users want all errors at once and a
  machine-readable list.

## R7 — Secret safety in the map

- **Decision**: The schema carries no field intended for secret values; the *scanner* (003) is
  responsible for excluding+flagging secret-like content, but the schema/validator MUST NOT require
  or provide a place to store a raw secret, and the Evidence Object stores `signal`/`path`, never the
  secret value (FR-011, SC-006).
- **Rationale**: Principle VII. A schema that had nowhere to put a secret is the structural guarantee.
- **Alternatives considered**: none needed — absence of a secret-bearing field is the decision.

---

## Outstanding / deferred (non-blocking)

- **ADR-001-tech-stack** is **PENDING** (file absent). Decisions R1–R2 are cited from the blueprint +
  spec Assumptions; ADR-001 should be authored (or this Technical Context promoted into it) before
  implementation tasks begin, to satisfy the CLAUDE.md Implementation Boundary cleanly.
- **YAML parser choice** (`yaml` vs `js-yaml`) is a package-selection detail deferred to
  `/speckit.tasks`; both parse to a plain object suitable for schema validation.
- **pnpm workspace layout** (single package vs workspace root) confirmed at tasks time.
