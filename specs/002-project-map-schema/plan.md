# Implementation Plan: Project Map Schema

**Branch**: `002-project-map-schema` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-project-map-schema/spec.md`

## Summary

Define and validate TenantGuard's canonical **Project Map** — the versioned, evidence-derived model
of a target repository that every downstream capability (scanner, gates, queue/router, prompt
compiler, PR reviewer) reads. This plan covers the *contract and its validation behavior only*: the
logical schema, the required `project-map.json` (canonical) and `project-map.yaml` (convenience)
outputs, the shared **Evidence Object** shape reused across specs, the `tenant_model.status` honesty
rule (no fabricated tenant values), a versioning/forward-compatibility policy, and field-level
validation errors — all runnable locally with no network or credentials.

**Technical approach** (decided at this plan layer per spec Assumptions + blueprint): represent the
schema as a **Zod schema** in TypeScript, which serves as both the runtime validator (field-level
errors, tolerant read of unknown fields) and the source from which a **JSON Schema** contract is
derived. JSON is canonical; YAML is a parsed-to-identical-object convenience. **No production code,
`package.json`, lockfile, or GitHub Action is created by this plan** — implementation begins only
after `plan.md` + `tasks.md` are reviewed (Constitution §Development Workflow).

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (current LTS at implementation time).
**Primary Dependencies**: Zod (schema definition + validation); a YAML parser (e.g. `yaml`) for the
  YAML convenience form. *Decided here at the plan layer*; see Research below.
**Storage**: Plain files — `project-map.json` (canonical) and `project-map.yaml` (convenience). No
  database (spec Non-Goals: "no database or persistence layer for maps").
**Testing**: Vitest (unit: schema accept/reject + field-level error messages; round-trip: JSON↔YAML
  equivalence; fixtures: conforming map, missing-required-field map, non-SaaS `not_detected` map,
  unknown-extra-field map).
**Target Platform**: Local developer machine / CI runner; library + (later) CLI. No network.
**Project Type**: Library (a schema + validator package) — the first internal package of the kernel.
**Performance Goals**: Validation of a single map completes effectively instantly (<100 ms for a
  realistic map); not a hot path. No throughput target.
**Constraints**: No network access, no credentials (FR-010); no secrets stored in or emitted by the
  map (FR-011); domain-neutral (FR-012); JSON canonical, YAML identical-meaning (FR-009).
**Scale/Scope**: One schema document per repo; supports single- and multi-repo/area projects
  (FR-002). Scope is the schema + validation only — **not** the scanner that fills it (003) or the
  gates that read it (004).

**Tech-decision provenance (Principle III — evidence)**: The stack (TypeScript / Node LTS / pnpm /
Vitest / Zod / JSON+YAML) is recorded in `docs/tenantguard_project_blueprint.md` (tech-stack table
and "Why TypeScript first") and in this spec's Assumptions. **`docs/decisions/ADR-001-tech-stack.md`
does not yet exist** — the CLAUDE.md "Implementation Boundary" references it, but it has not been
authored. This plan cites the blueprint + spec Assumptions as the decision source and flags
**ADR-001 as PENDING**; it should be written (or this plan's Technical Context promoted to it) before
implementation tasks begin. No stack is asserted without a recorded basis.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.* Evaluated against the 8
named principles in `.specify/memory/constitution.md` v1.0.0.

| Principle | Relevance to this feature | Status |
|-----------|---------------------------|--------|
| I. Source Truth First | Map is the evidence model; `tenant_model.status` + nullable fields prevent asserting unverified values; uncertain detections marked, not fabricated. | ✅ Pass |
| II. CLI First | Schema/validator is a local library, no network/credentials (FR-010). Usable from the CLI; no hosted dependency. | ✅ Pass |
| III. Evidence-Based Findings | Shared **Evidence Object** `{type, path, line, signal, confidence}` defined here is the cross-spec vehicle for evidence; tech decision itself is evidence-cited (blueprint), ADR-001 flagged pending. | ✅ Pass |
| IV. Spec-Compatible, not Spec-Kit-Dependent | Schema is repo-agnostic; validates maps for any repo incl. plain-docs/no-spec repos (empty collections, `not_detected`). | ✅ Pass |
| V. Agent Safety by Default | Not an agent-prompt feature; N/A directly. Schema carries the data later used to scope prompts. | ✅ N/A |
| VI. No Hidden Mutation | Validation is read-only; produces report/exit status, never mutates the target repo or git state. This plan creates no code and mutates no repo state. | ✅ Pass |
| VII. No Secrets | FR-011: secret-like values excluded + flagged, never stored in the map; Evidence Object carries `signal`/`path`, never the secret. | ✅ Pass |
| VIII. General SaaS Kernel — Clean Extraction | FR-012/AC-007: domain-neutral schema; no Retail Tower / ERPNext / POS fields. | ✅ Pass |

**Docs-first gate (Constitution §Development Workflow)**: 001/002/003 are now **Approved**, lifting
the review gate for *planning*. This `/speckit.plan` produces planning docs only; **implementation
still waits on reviewed `plan.md` + `tasks.md`** (AC-009: no production code / package.json / lockfile
in this feature). **No gate violations — no Complexity Tracking entries required.**

## Project Structure

### Documentation (this feature)

```text
specs/002-project-map-schema/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — tech decisions + alternatives (this command)
├── data-model.md        # Phase 1 — entities, fields, validation rules (this command)
├── quickstart.md        # Phase 1 — how to validate a map once implemented (this command)
├── contracts/
│   ├── project-map.schema.json   # Phase 1 — JSON Schema contract (described shape, NOT code)
│   ├── example-map.saas.yaml     # Phase 1 — conforming SaaS example (mirrors spec example)
│   └── example-map.non-saas.yaml # Phase 1 — non-SaaS, tenant_model.status=not_detected
├── checklists/
│   └── requirements.md  # (already present from /speckit.specify)
└── tasks.md             # Phase 2 — /speckit-tasks output (NOT created here)
```

### Source Code (repository root) — PLANNED, not created by this command

The schema is the kernel's first internal package. The planned layout (created later by
implementation tasks, after `tasks.md` review) is a single library:

```text
packages/project-map/          # the schema + validator library (created at implementation time)
├── src/
│   ├── schema.ts              # Zod schema: top-level fields, tenant_model, Evidence Object
│   ├── validate.ts            # validate(map) → { ok, errors[] } with field-level paths
│   ├── io.ts                  # load/parse JSON + YAML to one logical object (JSON canonical)
│   └── index.ts               # public surface: schema, validate, types, SCHEMA_VERSION
└── tests/
    ├── schema.accept.test.ts  # conforming maps validate
    ├── schema.reject.test.ts  # missing required field → named-field error
    ├── tenant-model.test.ts   # status enum + null strategy/tenant_key when not detected
    ├── evidence.test.ts       # Evidence Object shape; nullable line; confidence on evidence
    ├── compat.test.ts         # additive version bump keeps old maps valid; unknown field tolerated
    └── roundtrip.test.ts      # JSON↔YAML identical meaning
```

**Structure Decision**: Single library package `packages/project-map` (monorepo-friendly path,
consistent with the kernel having multiple packages later: scanner, gates, etc.). No `src/` at repo
root, no web/mobile structure. This plan **does not create** any of the above — it only records the
target layout for the implementation tasks. The exact package layout is confirmable/adjustable when
`/speckit.tasks` runs and the workspace tooling decision (pnpm workspace) is finalized.

## Complexity Tracking

> No Constitution Check violations. No entries required.
