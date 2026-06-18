# Implementation Plan: CLI Scanner

**Branch**: `003-cli-scanner` (impl branch: `003-impl-cli-scanner`) | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-cli-scanner/spec.md`

## Summary

Build the **CLI Scanner** — the producer half of the 002↔003 pair. It reads a local Git repository
**read-only** and emits a `project-map.json` that **validates against `@tenantguard/project-map`**
(002, already implemented and merged), plus **run notes** recording skips, insufficient-evidence
signals, and flagged secrets. It detects basic structure heuristically (manifest files, directory
conventions), is **deterministic** (stable ordering for re-scan diffing), **local-first** (no network,
no credentials), never fabricates values, and never copies secrets into output. Exposed via the MVP
CLI commands `tenantguard scan` and `tenantguard map`.

**Technical approach** (decided at this plan layer): a new package `packages/scanner` (detection +
map assembly) and a CLI package `packages/cli` (command wiring), both consuming
`@tenantguard/project-map` as a workspace dependency for the output contract and validation. CLI
framework: **Commander** (see Research R1; resolves the choice ADR-001 deferred → recorded as
**ADR-002**). **No production code is created by this plan**; implementation begins only after
`plan.md` + `tasks.md` are reviewed.

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (per ADR-001).
**Primary Dependencies**: `@tenantguard/project-map` (workspace, output contract + `validate`);
  **Commander** (CLI parsing); `yaml` (already used; optional YAML map emission). Node built-ins
  (`node:fs`, `node:path`) for read-only traversal — **no** shelling out to `git`, no network client.
**Storage**: Reads target repo files (read-only). Writes `project-map.json` (+ optional run-notes /
  YAML) to a **designated output path outside the scanned repo's tracked source** (default e.g.
  `./.tenantguard/project-map.json`, configurable) — never mutates scanned files (FR-003).
**Testing**: Vitest. Fixtures = sample repos under `tests/fixtures/` (a multi-tenant SaaS-shaped repo,
  an empty dir, a non-SaaS repo, a monorepo, an unreadable-path case). Assertions validate emitted
  maps with `@tenantguard/project-map`'s `validate()`.
**Target Platform**: Local dev machine / CI runner; Node CLI. No network.
**Project Type**: CLI tool + supporting library (monorepo packages).
**Performance Goals**: Scan a typical repo in a few seconds; report progress / not hang on large
  repos (FR edge case). No hard throughput target for MVP.
**Constraints**: Read-only on target (FR-003, SC-002); deterministic output (FR-010, SC-005);
  no network/credentials (FR-011, SC-007); no secrets in output (FR-012, SC-006); domain-neutral
  (FR-013); every populated value evidence-traceable (FR-004, SC-003).
**Scale/Scope**: Basic-structure heuristic detection only (manifests, dir conventions) — exhaustive
  per-language static analysis is an explicit Non-Goal. Single-repo and monorepo layouts (FR-007).

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.* Against the 8 named principles.

| Principle | Relevance | Status |
|-----------|-----------|--------|
| I. Source Truth First | The scanner *is* the source-truth producer; FR-004/FR-006 forbid fabrication, emit low-confidence/empty + "insufficient evidence" instead. | ✅ Pass |
| II. CLI First | Delivered as `tenantguard scan` / `map`; local, no network/credentials (FR-011). | ✅ Pass |
| III. Evidence-Based | Every populated value traces to a Detection Signal; uncertainty recorded via the shared Evidence Object / run notes (FR-004, SC-003). | ✅ Pass |
| IV. Spec-Compatible | Scans any repo incl. plain-docs/no-spec and non-SaaS (FR-008); reads `.specify/` if present but never requires it. | ✅ Pass |
| V. Agent Safety | N/A directly (not a prompt feature). | ✅ N/A |
| VI. No Hidden Mutation | **Strictly read-only on the scanned repo** (FR-003, SC-002); output written only to a designated path outside tracked source; no commit/push. | ✅ Pass |
| VII. No Secrets | Secret-like content flagged as a signal, never copied into the map/output (FR-012, SC-006); inherits 002's no-secret-field guarantee. | ✅ Pass |
| VIII. Clean Extraction | Domain-neutral heuristics; no Retail Tower / ERPNext / POS detection rules (FR-013). | ✅ Pass |

**No gate violations — no Complexity Tracking entries required.** Docs-first: this plan creates no
code; implementation waits on reviewed `plan.md` + `tasks.md`.

## Project Structure

### Documentation (this feature)

```text
specs/003-cli-scanner/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (CLI framework, traversal, determinism, output path)
├── data-model.md        # Phase 1 — Scan Run, Detection Signal, Run Note, detection rules
├── quickstart.md        # Phase 1 — planned `scan`/`map` usage + acceptance mapping
├── contracts/
│   └── cli-commands.md   # Phase 1 — `scan`/`map` command contract (args, exit codes, output)
├── checklists/
│   └── requirements.md   # (from /speckit.specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root) — PLANNED, not created by this command

```text
packages/scanner/             # detection + map assembly (created at implementation time)
├── src/
│   ├── detect/
│   │   ├── stack.ts          # runtime/package-manager/framework signals from manifests
│   │   ├── repos.ts          # repo/area + monorepo layout detection
│   │   ├── surfaces.ts       # critical-surface + boundary heuristics (best-effort, low-confidence ok)
│   │   └── secrets.ts        # secret-like detection → flag as signal, never copy value
│   ├── scan.ts               # orchestrates a read-only Scan Run → { map, notes }
│   ├── assemble.ts           # build a 002-conforming ProjectMap from signals (deterministic ordering)
│   ├── io.ts                 # read-only fs traversal; write output to designated path
│   └── index.ts              # public surface: scan(targetPath, opts) → ScanResult
└── tests/
    ├── scan.saas.test.ts     # multi-tenant fixture → 002-valid map (SC-001), evidence-traced (SC-003)
    ├── scan.empty.test.ts    # empty + non-SaaS fixtures → valid, empty, no fabrication (SC-004)
    ├── readonly.test.ts      # no scanned file created/modified/deleted (SC-002)
    ├── determinism.test.ts   # two scans → equivalent maps (SC-005)
    ├── secrets.test.ts       # secret-like content flagged, never copied (SC-006)
    └── monorepo.test.ts      # multi-repo layout → multiple repos[] (FR-007)

packages/cli/                 # the `tenantguard` CLI (created at implementation time)
├── src/
│   ├── index.ts              # Commander program; registers commands
│   ├── commands/
│   │   ├── scan.ts           # `tenantguard scan [path]` → writes project-map.json + notes
│   │   └── map.ts            # `tenantguard map` → show / re-emit the produced map
│   └── bin.ts                # #! entry (wired to package.json bin)
└── tests/
    └── cli.scan.test.ts      # scan command produces a valid map; exit codes; no scanned-repo mutation
```

**Structure Decision**: Two packages — `packages/scanner` (pure detection/assembly library, easy to
unit-test) and `packages/cli` (thin Commander wiring). Separation keeps detection logic testable
without the CLI and lets later features (004 gates, etc.) reuse the scanner library directly. This
plan **does not create** any of the above. The split is confirmable at `/speckit.tasks`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
