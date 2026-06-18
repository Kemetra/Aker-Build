# ADR-007: CI runtime — run the TypeScript CLI via pnpm + tsx; no live workflow, no published binary

**Status**: Accepted
**Date**: 2026-06-18
**Context feature**: `008-github-action`
**Relates**: ADR-001 (tech stack), ADR-002 (CLI framework), ADR-006 (diff source)

## Context

008 documents how a repository runs TenantGuard on `pull_request` and surfaces the scan + gate +
review verdict in CI, reusing the existing CLI (007's `review-pr`). The spec defers the **CI runtime /
packaging** to this layer (Non-Goals / Assumptions) and forbids creating a live `.github/workflows/*.yml`
in four places (Purpose, Non-Goals, Assumptions, AC-008). Two facts shape the runtime decision:

- The CLI bin is `packages/cli/src/bin.ts` — a **TypeScript** entry with **no build step and no
  published npm binary**. `npm i -g tenantguard` does not exist.
- 007 already emits both a human (`review.md`) and machine (`review.json`) artifact, so CI needs only to
  *invoke the CLI and read its outputs* — no new engine (FR-002).

## Decision

- **Invoke the CLI in CI via corepack `pnpm` + `tsx`** (a TS runner), e.g.
  `pnpm dlx tsx packages/cli/src/bin.ts review-pr ...`, from a checkout of the TenantGuard tooling. No
  build step; `tsx` runs the ESM TypeScript source directly.
- **Ship no live workflow file.** The deliverable is the integration contract + an **example workflow
  embedded in `quickstart.md` as documentation** + this ADR. Adopting the workflow (copying it under
  `.github/workflows/`) is the consumer's separately-gated opt-in — a live file would auto-activate CI
  on every PR (an outward-facing, hard-to-reverse action) without that opt-in.
- **Critical-gate-blocking is a documented `jq` step** over `review.json` (`severity == "critical"`),
  not a new CLI flag — keeping FR-002's "no separate engine" intact.

## Rationale

- **Grounded on what runs today**: documenting `npm i -g tenantguard` or a packaged composite Action
  would describe a setup that does not exist. pnpm is already the corepack-pinned workspace manager
  (`pnpm@11.0.8`); `tsx` needs no build.
- **No new code, no maintenance surface**: CI is pure wiring over 007's existing outputs (FR-002).
- **Honors No Hidden Mutation (VI) + AC-008**: no live workflow means no surprise CI activation; the
  job itself is read-only (`permissions: contents: read`, no commit/push/comment).
- **Additive forward path**: a published `tenantguard` binary and/or a packaged composite GitHub Action
  are later, additive steps behind the same documented chain — they don't change the contract.

## Alternatives considered

- **Assume a published `tenantguard` binary** — none exists; would document a broken setup step.
  Rejected for v0; revisit when the CLI is published.
- **Compile the CLI in CI (a build step)** — heavier than running the source with `tsx`; deferred.
- **Ship a live `.github/workflows/tenantguard.yml`** — contradicts AC-008's four-place carve-out and
  auto-activates CI without the consumer's opt-in. Rejected.
- **Add a `tenantguard review-pr --fail-on critical` flag** — would be the only testable code unit, but
  risks growing into the "separate engine" FR-002 forbids; the `jq` step keeps enforcement in the
  workflow. Rejected for v0 (could be revisited if CI ergonomics demand it).

## Consequences

- `specs/008-github-action/quickstart.md` carries the example workflow (checkout PR head → `scan` →
  `review-pr` → publish `review.md` → optional `jq` critical gate). `contracts/` define the inputs +
  the check-status rule.
- Publishing the CLI / packaging a composite Action is a clean follow-up: replace the `pnpm dlx tsx …`
  invocation with the published entry point; the chain and contract are unchanged.
- No `.github/workflows/*.yml`, no `packages/*`, no `package.json`/lockfile change is introduced by 008.
