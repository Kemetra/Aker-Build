# Phase 0 Research: Agent Prompt Compiler

Decisions resolvable from the approved spec, the constitution, ADR-001/002, the shipped 005 package
(`QueueItem`), and the blueprint. Research inline (no subagents). Format: **Decision / Rationale /
Alternatives**.

---

## R1 — Templating: hand-written TypeScript Markdown builders (resolves deferred choice → ADR-005)

- **Decision**: Build prompts with plain TypeScript functions that assemble Markdown strings — one
  builder per section, composed per renderer. No templating-engine dependency (Handlebars/EJS/etc.).
  Recorded as **ADR-005** (a 006 task).
- **Rationale**: The output is a fixed, small set of sections with mostly-constant blocks (git rules,
  stop conditions). Hand-written builders are fully testable, type-safe against the `QueueItem`,
  deterministic by construction, and add no dependency surface (CLI-First, II; "no templating engine"
  Non-Goal). A template engine would add indirection and a runtime for no benefit at this size.
- **Alternatives considered**:
  - *Handlebars/EJS/Mustache* — useful for user-authored templates; premature for a fixed v0 structure
    and an extra dependency. Revisit if prompt templates become user-customizable.

## R2 — Input edge: read `queue.json`, look up `<ID>`, reuse scanner io

- **Decision**: `packages/prompt` loads `queue.json` (005) from the out-dir, finds the item whose `id`
  matches `<ID>`, and reuses `@tenantguard/scanner`'s read-only `io.ts` for the optional `prompt-<ID>.md`
  write. It imports the `QueueItem` type from `@tenantguard/queue`.
- **Rationale**: Mirrors the 004/005 evidence-edge pattern (consume a written artifact, centralize
  read-only io). Missing `queue.json` → "run `tenantguard queue` first"; unknown `<ID>` → clear error.
  No re-derivation, keeping the route→prompt boundary clean.
- **Alternatives considered**:
  - *Compiler re-derives the queue* — couples prompt to queue/gates/scan; the CLI can chain
    `queue → route → prompt` instead.

## R3 — Section → field mapping, grounded in the REAL 005 `QueueItem`

- **Decision**: Map each required prompt section to an actual `QueueItem` field (see data-model for the
  full table). Key groundings (verified against `packages/queue/src/types.ts`):
  - **Objective ← `title`** — there is **no** `objective` field on a `QueueItem`; the title is the
    objective.
  - **Scope-completeness check** = `title` non-empty AND `allowed_files` non-empty AND `validation`
    non-empty. **`forbidden_files` is present-may-be-empty** (the 005 deriver emits `[]`, meaning
    "nothing forbidden beyond the default git rules"), so it is **excluded** from the non-empty check.
  - Context ← `source.evidence`; Allowed/Forbidden ← `allowed_files`/`forbidden_files`; Validation ←
    `validation`; Stop conditions ← `stop_conditions` + the spec's default stop conditions; Final report
    ← `final_report.required`. Repo-state verification + Git rules are compiler-injected constants.
- **Rationale**: Avoids the refuse-every-item bug a literal reading of the spec's "objective,
  allowed/forbidden files" would cause (objective field doesn't exist; forbidden_files is legitimately
  empty). This is the cross-artifact grounding the 004/005 lesson mandates.
- **Alternatives considered**:
  - *Require an `objective` field / non-empty `forbidden_files`* — would reject every real 005 item.
    Rejected.

## R4 — Renderer contract: presentation varies, safety invariant

- **Decision**: All renderers (claude/codex/generic) emit the **same section set in the same order**
  with **byte-identical default blocks** (git rules, stop conditions, final-report fields); they differ
  only in **presentation** (heading style and an agent-appropriate framing preamble). Unknown agent →
  generic renderer + a one-line note (FR-010).
- **Rationale**: FR-015 / SC-005 — the safety contract must hold regardless of renderer. Making the
  invariant blocks shared constants (not per-renderer copies) guarantees parity and makes SC-005
  mechanically testable (assert byte-identical constant blocks across renderers).
- **Alternatives considered**:
  - *Per-renderer copies of git rules/stop conditions* — risks drift; rejected. Single source of truth
    in `defaults.ts`.

## R5 — Determinism & secret safety

- **Decision**: Section order is fixed; no clock/random/locale-dependent operations; the same
  `(item, agent)` yields byte-identical Markdown (SC-008). Secret-like content in the item's evidence
  is reported by `signal` name only (inherited from 002/004) — the compiler never reads or renders a
  raw secret value, and excludes/flags any secret-like context (FR-007, SC-004).
- **Rationale**: FR-016 / SC-008 make prompts diffable and testable; FR-007 / SC-004 keep them safe.
  The upstream evidence is already secret-safe, so the compiler simply must not introduce new content
  that could carry a secret.
- **Alternatives considered**: *Embed a timestamp/run id in the prompt* — breaks byte-determinism;
  rejected (any such metadata, if ever needed, lives outside the compared prompt body).

## R6 — Fixtures

- **Decision**: Tests use synthetic `QueueItem`s: a fully-scoped item (compiles), an item missing
  `validation` and one missing `allowed_files` (refusal), and an item with `forbidden_files: []`
  (compiles — the real-005 regression). The CLI test writes a `queue.json` containing these.
- **Rationale**: Covers SC-001…SC-008 + FR-009/FR-010 deterministically without invoking scan/gates/
  queue end-to-end; the upstream packages have their own fixtures.
- **Alternatives considered**: *Only end-to-end via the full chain* — slower and conflates upstream
  derivation with prompt compilation; keep a synthetic item layer for compiler unit tests.
