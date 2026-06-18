# Phase 0 Research: CLI Scanner

Decisions resolvable from the approved spec, ADR-001, the shipped 002 package, and the blueprint.
Research inline (no subagents). Format: **Decision / Rationale / Alternatives**.

---

## R1 — CLI framework: Commander (resolves ADR-001 deferral → ADR-002)

- **Decision**: **Commander** for the `tenantguard` CLI.
- **Rationale**: The MVP CLI is a small, flat command set (`scan`, `map`, later `gates`, `queue`,
  `route`, `prompt`, `review-pr`, `report`). Commander is lightweight, zero-config, widely used, and
  adds minimal dependency surface — fitting CLI-First (Principle II) and the "no heavy scaffolding"
  posture. ADR-001 left "Commander or oclif" open; this plan picks Commander and records it as
  **ADR-002** (T001 of 003 tasks).
- **Alternatives considered**:
  - *oclif* — powerful plugin architecture + scaffolding, but heavier and oriented to large,
    extensible CLIs; premature for the MVP command set. Reconsider if a plugin ecosystem is wanted.
  - *Hand-rolled `process.argv` parsing* — zero deps, but reinvents help/usage/validation; not worth
    it past two commands.

## R2 — Read-only traversal: Node `fs` only, no `git` shell-out

- **Decision**: Traverse the repo with Node built-ins (`node:fs`, `node:path`), reading files only.
  Do **not** shell out to `git` and do **not** use a network client.
- **Rationale**: FR-003 (strictly read-only), FR-011 (no network/credentials), SC-002 (100% files
  unchanged). Pure `fs` reads cannot mutate the repo and need no credentials. `.git/` and ignored
  paths are traversed read-only or skipped; we never invoke git commands that could change state.
- **Alternatives considered**:
  - *`git ls-files` / `simple-git`* — convenient ignore handling, but adds a process/dependency and a
    (small) surface for state interaction; unnecessary for read-only structure detection in MVP.

## R3 — Determinism (re-scan stability)

- **Decision**: All collections in the emitted map use a **stable sort** (e.g. by `path`/`id`/name);
  detection visits paths in sorted order; timestamps/non-deterministic fields are excluded from the
  canonical map (any `generated_at` lives in run notes / optional metadata, not asserted equal across
  runs).
- **Rationale**: FR-010 / SC-005 — two scans of an unchanged repo must produce equivalent maps for
  diffing. Sorting + excluding clocks from the compared surface guarantees it.
- **Alternatives considered**: *Insertion-order output* — rejected; filesystem iteration order is not
  guaranteed stable across platforms, producing spurious diffs.

## R4 — Output location (no mutation of scanned repo)

- **Decision**: Write `project-map.json` (and optional `project-map.yaml` / run-notes) to a
  **designated path outside the scanned repo's tracked source**, default `./.tenantguard/`
  (configurable via a `--out` flag). Writing there is **not** a modification of the scanned repo's
  tracked files (FR-003 explicitly allows output to a designated location).
- **Rationale**: Keeps the read-only guarantee on tracked source while still producing a useful
  artifact. `.tenantguard/` is a conventional tool-output dir; projects can `.gitignore` it.
- **Alternatives considered**: *stdout-only* — good for piping, kept as an option (`--stdout`), but a
  file default matches `tenantguard map` re-emit and downstream consumers (004 reads the file).

## R5 — Output conformance + validation against 002

- **Decision**: The scanner builds a `ProjectMap` and **validates it with
  `@tenantguard/project-map`'s `validate()` before writing**; if assembly ever produces an invalid
  map, that is a scanner bug (fail the run with the field-level errors), never emit an invalid file.
- **Rationale**: FR-002 / SC-001 — output MUST conform to 002. Reusing 002's validator (single source
  of truth) prevents drift between producer and contract.
- **Alternatives considered**: *Trust assembly without validating* — rejected; loses the guarantee
  and the 002 honesty invariants (tenant_model) at the producer boundary.

## R6 — Secret handling

- **Decision**: A `detect/secrets` pass flags secret-like content (high-signal patterns) as a
  **Run Note / Evidence signal** (`signal: "secret_like_content"` + `path`, never the value). The map
  has no field to hold a secret (inherited from 002, R7 there). Secret *values* are never read into
  output, logs, or notes.
- **Rationale**: FR-012 / SC-006 / Principle VII.
- **Alternatives considered**: *Ignore secrets entirely* — rejected; flagging is useful and is the
  honest, safe behavior. *Store redacted previews* — rejected; even partial secrets must not leak.

## R7 — Detection scope (heuristic, basic structure)

- **Decision**: MVP detection = high-signal markers only: package manifests (`package.json`,
  `pnpm-workspace.yaml`, `pyproject.toml`, `go.mod`, etc.) → runtime/package-manager/frameworks;
  directory conventions (`apps/*`, `packages/*`, `services/*`) → repos/areas + monorepo; obvious
  framework deps → `frameworks[]`. Tenant model / boundaries are best-effort and **often
  `not_detected`/low-confidence** — that is honest, not a failure (spec Assumptions).
- **Rationale**: FR-005/FR-006; "full static analysis" is an explicit Non-Goal. High-signal heuristics
  give value without overclaiming.
- **Alternatives considered**: *AST/dataflow analysis* — out of MVP scope; deferred.

---

## Outstanding / deferred (non-blocking)

- **ADR-002 (CLI framework = Commander)** authored as 003 task T001 before CLI package code.
- **Exact `.gitignore`-awareness** of traversal (whether to honor the scanned repo's `.gitignore`)
  settled at tasks time; default MVP skips `node_modules`, `.git/` internals, and common build dirs.
- **`tenantguard` bin wiring** (single CLI package vs per-command) confirmed at `/speckit.tasks`.
