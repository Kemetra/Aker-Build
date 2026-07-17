# ADR-001: MVP Technology Stack

- **Status**: Accepted
- **Date**: 2026-06-18
- **Deciders**: Aker Build maintainers
- **Context tasks**: `specs/002-project-map-schema/tasks.md` T001 (this ADR unblocks the CLAUDE.md
  Implementation Boundary before any package code is written).

## Status note

This ADR **formalizes an already-ratified decision**, it does not introduce a new one. The
Aker Build Constitution v1.0.0 (§"MVP Scope & Constraints") already states the technology baseline:
"TypeScript on Node.js LTS, pnpm, Vitest for tests, Zod for schema validation, JSON/YAML config, JSON
files for local storage." This ADR records that decision in the conventional location
(`docs/decisions/`) referenced by `CLAUDE.md`, with its rationale and alternatives, so the evidence
chain is explicit (Constitution Principle III — Evidence-Based Findings).

## Context

Aker Build is a CLI-first SaaS Build Kernel (Constitution Principle II). Before implementing the
first package (`002-project-map-schema`), the language, runtime, package manager, test framework, and
validation library must be chosen and recorded. The drivers:

- **CLI-first, local, no network/credentials** for core flows (Principle II).
- **Schema- and JSON/YAML-heavy** work: the Project Map (002) and every downstream consumer
  (gates, queue, prompts, reviewer) read/validate structured documents.
- **npm-first developer distribution** to reach the target audience (indie hackers / small teams
  using AI agents).
- **Fast iteration with AI coding agents** and strong static types to keep agent-generated changes
  inside architecture boundaries.

## Decision

Adopt the following MVP stack (verbatim from `docs/aker-build_project_blueprint.md` §"Final MVP
stack", and consistent with `specs/002-project-map-schema/spec.md` Assumptions and `plan.md`):

| Area | Decision |
|------|----------|
| Primary language | **TypeScript** |
| Runtime | **Node.js LTS** |
| Package manager | **pnpm** |
| Testing | **Vitest** |
| Schema validation | **Zod** (source of truth; JSON Schema derived as a contract artifact) |
| Config / serialization | **JSON (canonical) + YAML (convenience)** |
| Local storage | **JSON files first** (SQLite deferred) |
| CLI framework | **Commander or oclif** (selected when the CLI is built — `003`, not now) |

For `002-project-map-schema` specifically: the schema is defined once as a **Zod** schema (giving
field-level validation errors and inferred TypeScript types), with a derived **JSON Schema**
documentation artifact (`specs/002-project-map-schema/contracts/project-map.schema.json`). See
`research.md` R1–R2.

## Rationale

From the blueprint (§"Why TypeScript first"): TypeScript gives the fastest path for CLI distribution
through npm, GitHub API integration, JSON/YAML/schema-heavy tooling, SaaS-repo compatibility,
developer adoption, and fast iteration with AI coding agents. Zod provides one authoritative schema
that yields both runtime validation (with field paths) and compile-time types, avoiding a hand-synced
validator/type split. JSON is the machine-canonical contract; YAML is a human-authoring convenience
parsed to the identical object.

## Alternatives considered

From the blueprint (§"Deferred technology"):

- **Rust** — good for high-performance binaries; not needed for an MVP whose bottleneck is developer
  adoption, not runtime speed.
- **Go** — good for CLIs, but TypeScript is faster for this product's npm/GitHub ecosystem and
  schema-heavy work.
- **Python** — useful for analysis, but less ideal for npm-first SaaS developer distribution.
- **JSON Schema (ajv) as the source of truth** — interoperable, but no inferred TS types and weaker
  ergonomics for conditional rules (e.g. tenant_model honesty). Kept as a *derived* artifact instead
  (see `research.md` R1).
- **OPA/Rego policy engine** — powerful, but premature before the rule model stabilizes (deferred;
  Constitution MVP Non-Goals).

## Consequences

- **Positive**: single-language toolchain; one schema definition (Zod) drives validation + types +
  derived JSON Schema; local-first, no network/credentials; npm distribution path; strong typing
  keeps AI-agent changes in bounds.
- **Costs / constraints**: adds runtime dependencies (Zod, a YAML parser) — their introduction
  changes `package.json`/lockfile and therefore **requires explicit approval** per the Constitution
  (lockfiles MUST NOT change unless package changes are explicitly approved). Captured as tasks
  `002 T002`/`T003`, which are gated and **not** unblocked by this ADR.
- **Deferred**: SQLite, Octokit/GitHub App, OPA/Rego, hosted dashboard (Next.js + PostgreSQL) — all
  later, separately-approved waves. The CLI framework choice (Commander vs oclif) is deferred to the
  `003-cli-scanner` work, not decided here.

## References

- Constitution v1.0.0 — `.specify/memory/constitution.md` (§"MVP Scope & Constraints").
- Blueprint — `docs/aker-build_project_blueprint.md` (§"Final MVP stack", §"Why TypeScript first",
  §"Deferred technology").
- Spec — `specs/002-project-map-schema/spec.md` (Assumptions).
- Plan / Research — `specs/002-project-map-schema/plan.md`, `research.md` (R1, R2).
