# Implementation Plan: SaaS Gates v0

**Branch**: `004-saas-gates-v0` (plan branch: `004-saas-gates-v0-plan`) | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-saas-gates-v0/spec.md`

## Summary

Build **SaaS Gates v0** — TenantGuard's risk-detection layer. It reads the Project Map (002) plus
read-only repo evidence and produces `.tenantguard/risks.json`: a single unified `findings[]` array
where each finding carries a `gate_id`, a `status` (`risk` / `needs_verification` / `not_applicable`),
and (for `risk` findings) a `severity` (`low`/`medium`/`high`/`critical`) plus one or more **shared
Evidence Objects** reused verbatim from `@tenantguard/project-map`. v0 detection is **signal-based**
(not full static analysis): false negatives are acceptable; every emitted finding is evidence-backed,
deterministic, read-only, local-first, secret-free, and domain-neutral. Exposed via `tenantguard gates`
(full set or a `--gates TG-G4,TG-G5` subset).

**Technical approach** (decided at this plan layer):

1. **Rule-engine = TypeScript-coded gate functions** (one module per gate), not a YAML/Rego policy
   engine — resolving the spec's deferred choice (Non-Goals: "Choosing a rule-engine library or
   language (decided at plan layer)"). Recorded as **ADR-003** (a 004 task, mirroring how 003 recorded
   ADR-002 via T001). See Research R1.
2. **Evidence-consumption edge**: a new package `packages/gates` consumes an **already-written
   `project-map.json`** (loaded + validated via `@tenantguard/project-map`) and gets file-level reads
   by **reusing `@tenantguard/scanner`'s read-only `io.ts` primitives** — centralizing the read-only
   guarantee rather than reinventing fs access. See Research R2.
3. **Schema home**: the discriminated-union `findingSchema` / `risksSchema` live **in
   `packages/gates`** (a new artifact, not the project map), **importing `evidenceSchema` from
   `@tenantguard/project-map`** and never redefining it (FR-003). See Research R3.

**No production code is created by this plan.** Implementation begins only after `plan.md` + `tasks.md`
are reviewed (AC-009; constitution §Development Workflow).

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (per ADR-001).
**Primary Dependencies**: `@tenantguard/project-map` (workspace — `evidenceSchema`, `projectMapSchema`,
  `validate`, `loadJson`); `@tenantguard/scanner` (workspace — read-only `io.ts` traversal primitives);
  **Commander** (CLI parsing, per ADR-002); **Zod** (the `risks.json` schema). Node built-ins
  (`node:fs`, `node:path`) only via the reused scanner io — no `git` shell-out, no network client.
**Storage**: Reads target repo files (read-only) and a previously produced `project-map.json`. Writes
  `risks.json` to the **designated output dir outside the scanned repo's tracked source** (default
  `./.tenantguard/risks.json`, the same convention 003 uses for `project-map.json`; FR-014) — never
  mutates scanned files (FR-008).
**Testing**: Vitest. Fixtures = the reused 003 scanner fixtures (`saas`, `monorepo`, `empty`) plus
  **per-gate clean/violation** fixtures (the "v0 sample set", SC-003). Fixtures are prepared as Git
  repos at test time via the shared helper pattern established in the 003 fix (copy-to-tempdir +
  `git init`).
**Target Platform**: Local dev machine / CI runner; Node CLI. No network.
**Project Type**: CLI tool + supporting library (monorepo packages).
**Performance Goals**: Run the v0 gate set over a typical repo in a few seconds; no hard throughput
  target for MVP.
**Constraints**: Read-only on target (FR-008, SC-002-adjacent); deterministic findings + ordering
  (FR-007, SC-005); no network/credentials (FR-010, SC-007); no secrets in output (FR-009, SC-006);
  domain-neutral (FR-011); every `risk` finding evidence-backed (FR-003, SC-001/SC-002); insufficient
  evidence → `needs_verification`, not pass/fail (FR-004, SC-004); inapplicable → `not_applicable`
  (FR-005).
**Scale/Scope**: Signal-based detection of the v0 gate set TG-G0…TG-G9 — exhaustive per-language
  data-flow analysis is an explicit Non-Goal. Single-repo and monorepo layouts.

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.* Against the 8 named principles.

| Principle | Relevance | Status |
|-----------|-----------|--------|
| I. Source Truth First | Gates read source evidence + the Project Map before asserting; insufficient evidence → `needs_verification`, never a fabricated pass/fail (FR-004, SC-004). | ✅ Pass |
| II. CLI First | Delivered as `tenantguard gates` (incl. `--gates` subset); local, no network/credentials (FR-010). | ✅ Pass |
| III. Evidence-Based | Every `risk` finding cites ≥1 shared Evidence Object reused from 002; findings without evidence not emitted (FR-003, SC-002). | ✅ Pass |
| IV. Spec-Compatible | Runs over any scanned repo's map (incl. plain-docs / non-SaaS); reads `.specify/` evidence if present, never requires it. | ✅ Pass |
| V. Agent Safety | N/A directly (not a prompt feature; gate findings feed 006/007 later). | ✅ N/A |
| VI. No Hidden Mutation | **Read-only on the scanned repo** (FR-008); output only to the designated out-dir (FR-014); no commit/push/auto-fix (Non-Goals). | ✅ Pass |
| VII. No Secrets | Secret-like content flagged as a finding, value never copied (FR-009, SC-006); inherits 002's `.strip()` no-secret-field guarantee on the evidence shape. | ✅ Pass |
| VIII. Clean Extraction | Generalized SaaS gate rules only — no Retail Tower / ERPNext / POS specifics (FR-011). | ✅ Pass |

**No gate violations — no Complexity Tracking entries required.** Docs-first: this plan creates no
code; implementation waits on reviewed `plan.md` + `tasks.md`.

## Project Structure

### Documentation (this feature)

```text
specs/004-saas-gates-v0/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (rule engine, evidence edge, schema home, severity, determinism, sample set)
├── data-model.md        # Phase 1 — Gate, Finding (discriminated union), Risk List, Severity, per-gate v0 signals
├── quickstart.md        # Phase 1 — planned `tenantguard gates` usage + acceptance mapping
├── contracts/
│   ├── gates-cli.md      # Phase 1 — `tenantguard gates` command contract (args, --gates, exit codes, output)
│   └── risks-json.md     # Phase 1 — risks.json shape contract (findings[], status union, evidence reuse)
├── checklists/
│   └── requirements.md   # (from /speckit.specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root) — PLANNED, not created by this command

```text
packages/gates/               # gate model + v0 check set + risks.json schema (created at implementation time)
├── src/
│   ├── schema.ts            # Zod: findingSchema (discriminatedUnion on status), risksSchema; imports evidenceSchema from 002
│   ├── types.ts             # Gate, GateContext, Finding, Severity types
│   ├── context.ts           # build GateContext: load+validate project-map.json, wire scanner io.ts read-only reads
│   ├── registry.ts          # the v0 gate set TG-G0..TG-G9 (id, name, purpose, run fn); subset selection by id
│   ├── gates/
│   │   ├── g0-source-truth.ts        # evidence-presence gate
│   │   ├── g1-architecture.ts        # boundary-violation signals
│   │   ├── g2-contract.ts            # API/contract drift signals
│   │   ├── g3-migration.ts           # risky DB change signals
│   │   ├── g4-security.ts            # auth/tenant-isolation signals
│   │   ├── g5-idempotency.ts         # duplicate-work signals
│   │   ├── g6-billing.ts             # billing/usage signals
│   │   ├── g7-observability.ts       # missing operational-signal checks
│   │   ├── g8-dependency.ts          # dependency/upgrade signals
│   │   └── g9-release.ts             # release-blocker signals
│   ├── run.ts               # orchestrate: select gates → run each → collect unified findings[] (deterministic sort)
│   ├── io.ts                # write risks.json to designated out-dir (delegates reads to scanner io)
│   └── index.ts             # public surface: runGates(opts) → RisksResult
└── tests/
    ├── findings-shape.test.ts        # every finding cites gate_id+status; risk findings cite severity+evidence (SC-002)
    ├── known-violation.test.ts       # per-gate violation fixture → finding tied to right gate w/ evidence (SC-001)
    ├── clean-no-fp.test.ts           # per-gate clean fixture → 0 false-positive findings (SC-003)
    ├── needs-verification.test.ts    # insufficient evidence → status: needs_verification (SC-004)
    ├── not-applicable.test.ts        # inapplicable gate → status: not_applicable, severity null (FR-005)
    ├── determinism.test.ts           # two runs over unchanged input → equivalent risk lists (SC-005)
    ├── secrets.test.ts               # secret-like content flagged, never copied (SC-006)
    ├── subset.test.ts                # --gates TG-G4,TG-G5 runs only the named gates (FR-006)
    └── readonly.test.ts              # no scanned-repo file created/modified/deleted (FR-008)

packages/cli/                 # extend the existing tenantguard CLI (no new package)
├── src/commands/gates.ts     # `tenantguard gates [--gates ids]` → runGates → write risks.json; "run scan first" path
└── tests/cli.gates.test.ts   # command produces valid risks.json; --gates subset; exit codes
```

**Structure Decision**: A new `packages/gates` library (pure gate model + v0 checks + the `risks.json`
schema) plus a thin new command in the **existing** `packages/cli`. `packages/gates` depends on
`@tenantguard/project-map` (output contract + `evidenceSchema` + `validate`) and `@tenantguard/scanner`
(read-only `io.ts`), keeping the read-only guarantee in one place and letting 005/007 reuse the gate
library directly. This plan **does not create** any of the above; the split is confirmable at
`/speckit-tasks`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
