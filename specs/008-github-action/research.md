# Phase 0 Research: GitHub Action

Decisions resolvable from the clarified spec, the constitution, ADR-001/002, the shipped 003/004/007
packages, and the real CLI surface. Research inline (no subagents). Format: **Decision / Rationale /
Alternatives**.

---

## R1 — Pure CI wiring over 007's outputs (no new engine, no new TS)

- **Decision**: The Action runs the existing CLI — **checkout PR head → `tenantguard scan` →
  `tenantguard review-pr`** — and surfaces `review.md` (human summary) into the CI run, reading
  `review.json` for the machine verdict + findings. **No new TypeScript, no new package, no TDD suite.**
- **Rationale**: FR-002 ("reuse the existing CLI, not a separate engine") + the Integration Surface
  ("no new core behavior beyond CI wiring") + AC-008 (no live workflow) leave 008 as pure
  documentation/wiring. 007 already emits both a human (`review.md`) and machine (`review.json`) artifact
  precisely so a CI surface can consume them — the forward-design from 007 is the substrate here.
- **Alternatives considered**:
  - *A new `@tenantguard/action` package that re-implements the chain* — violates FR-002 ("no separate
    engine") and adds a maintenance surface for zero new behavior. Rejected.

## R2 — CI uses PR-NUMBER mode (not `--local-diff`); PR-head checkout supplies the file contents

- **Decision**: The example workflow uses **`review-pr <number>`** (PR-number mode), NOT
  `review-pr --local-diff`, and **checks out the PR head** before `scan`/`review-pr`. The changed-files
  **SET** comes from GitHub via `gh pr view --json files` (relative to the PR base); the file
  **CONTENTS** the gates inspect come from the checked-out working tree.
- **Rationale**: 007's `changedFiles` (local-diff) runs `git diff --name-only HEAD` (+ `--cached`,
  + untracked) — all relative to **HEAD**. After `actions/checkout@v4` with `ref: head.sha`, the working
  tree **is** HEAD: clean, nothing staged, nothing untracked → **all three commands return empty** →
  `changed_files = []` → every finding is filtered out → verdict `ready`, **on every PR**. So
  `--local-diff` is structurally wrong for CI (it's for a developer's *uncommitted* local changes). PR
  mode (`gh.ts` `prChangedFiles`) sources base-relative changed files, which DO attribute. The checkout
  is still required because the gates read file contents from the tree. Minimal chain:
  `checkout head → scan → review-pr <number>` (an explicit `gates` step is redundant — review-pr runs
  the gates internally). Grounded in `packages/review/src/git.ts:13-15` (the three HEAD-relative
  commands) and `packages/review/src/gh.ts:16` (the `gh pr view` source).
- **Linchpin (verified): PR changed-file paths and evidence paths share one format — repo-relative
  POSIX — so attribution matches.** Evidence paths derive from the scanner's `listFiles`
  (`packages/scanner/src/io.ts`: `relative(root, …).split(sep).join("/")`), and `gh.ts:36` normalizes
  `gh`'s `files[].path` (GitHub returns repo-relative POSIX) the same way (`.split("\\").join("/")`).
  Were the formats to differ (absolute / base-prefixed), PR mode would fail with the **same false-Ready
  symptom** as the local-diff bug, from a different cause — hence this is recorded as verified, not
  assumed.
- **Alternatives considered**:
  - *`review-pr --local-diff` in CI* — empty diff after checkout → false "Ready" every run. **Rejected
    (this was the original draft's bug, caught in implement review).**
  - *`scan → review-pr` with no checkout* — gates can't read the PR's file contents. Rejected.
  - *`checkout → scan → gates → review-pr`* — double-runs the gates (review-pr already calls them).
    Rejected as redundant (matches the spec's old prose, not what 007 needs).

## R3 — Critical-gate-blocking driven by `severity:"critical"` in review.json

- **Decision**: The optional check status (FR-004) is computed by reading `review.json` and **failing
  only when a diff-attributable finding has `severity: "critical"`** (plus 004's TG-G9 critical
  aggregator, which is itself a critical finding). Documented as a small `jq` step over `review.json`.
  The **verdict drives the summary** (FR-003); **`severity` drives the check** (FR-004). When blocking
  is disabled, findings are report-only and the check passes.
- **Rationale**: 007 makes **any** diff-attributable `risk` `not_ready` and explicitly treats `severity`
  as reporting detail, not the verdict driver. So `not_ready → fail` would fail non-critical findings —
  violating **SC-003** (non-critical → pass while reported). Keying off `severity:"critical"` satisfies
  **SC-002** (critical → fail) *and* SC-003. The exit code can't drive it either: a Not-Ready review
  exits 0 (007 contract: "008 will read the verdict from `review.json`, not the process exit code").
- **Grounding (the `jq severity=="critical"` selector matches real output)** — verified against shipped
  code, not assumed: `severity` is the 004 `SEVERITIES` enum `["low","medium","high","critical"]`
  (`packages/gates/src/schema.ts`), carried verbatim onto `risk` findings in 007's `review.json`
  (`packages/review/src/schema.ts` `gateFindingSchema`). A `critical` value is genuinely produced — e.g.
  G4's secret-in-log rule emits `risk(ID, "critical", …)` (`packages/gates/src/gates/g4-security.ts:50`),
  and 004's TG-G9 aggregator injects a `critical` finding when any critical exists. The 007
  `e2e-chain.test.ts` already proves `scan → review-pr` writes a real `review.json`/`review.md`. So
  `jq '[.findings[] | select(.severity=="critical")] | length'` selects exactly the blocking findings.
  (This is documentation-level validation — no new test is added, per AC-008 / the no-new-code decision.)
- **Alternatives considered**:
  - *`verdict == "not_ready" → fail`* — violates SC-003. Rejected.
  - *process exit code* — Not-Ready exits 0; exit≠0 means the review couldn't run, not "unsafe".
    Rejected.

## R4 — CLI-in-CI invocation: run the unbuilt TS CLI via pnpm + tsx (ADR-007)

- **Decision**: The CLI bin is `packages/cli/src/bin.ts` — a **TypeScript** entry with **no build step
  and no published npm binary**. The example workflow therefore obtains the TenantGuard tooling (a
  checkout / future published package) and runs the CLI via **corepack pnpm + a TS runner (`tsx`)**,
  e.g. `pnpm dlx tsx packages/cli/src/bin.ts review-pr ...`. Recorded as **ADR-007** (CI runtime/
  packaging). A published `tenantguard` binary / a packaged composite Action is a later, additive step.
- **Rationale**: Grounding the example on what actually runs today avoids documenting a `npm i -g
  tenantguard` step that does not exist. pnpm is already the workspace manager (corepack-pinned
  `pnpm@11.0.8`); `tsx` runs the ESM TS directly with no build. The spec defers "CI runtime/packaging"
  to the implementation layer (Non-Goals / Assumptions) — ADR-007 is where that lands.
- **Alternatives considered**:
  - *Assume a published `tenantguard` binary* — none exists yet; would document a broken setup step.
    Rejected for v0 (revisit when the CLI is published / packaged as a composite action).
  - *Add a build step to compile the CLI in CI* — heavier; `tsx` runs the source directly. Deferred.

## R5 — Secrets, read-only, error-surfacing in CI

- **Decision**: The summary/logs carry only `review.md` content (secret-safe by construction —
  evidence names `signal`, never raw values, inherited from 002/004/007). The Action is **read-only on
  the repo** (007 writes only to the out-dir; the workflow does no commit/push/merge/comment). On a
  TenantGuard error (non-zero exit ≠ a Not-Ready verdict), the **job fails with the error surfaced** —
  never a silent pass (FR-008, SC-007). No tokens are stored; only the CI-provided token is used
  (FR-007).
- **Rationale**: FR-005..FR-008 + SC-004..SC-007 are satisfied by inheriting 007's guarantees and by
  the workflow doing nothing mutating. The error-vs-verdict distinction matters: exit 0 = a verdict was
  produced (summarize it); exit ≠0 = the review couldn't run (fail the job and show the error).
- **Alternatives considered**: *Swallow errors and pass* — violates FR-008/SC-007. Rejected.

## R6 — Validation strategy (no new unit suite)

- **Decision**: Because 008 ships no new code, validation is **documentation-level**: the example
  workflow's command chain is checked against the real 007 `review-pr` contract + the existing review
  e2e (`scan → review-pr` works and produces `review.json`/`review.md`); the critical-blocking `jq`
  expression is checked against `review.json`'s real `findings[].severity` shape (004/007 schema).
- **Rationale**: There is nothing executable to unit-test; manufacturing a code unit just to have a
  test would violate FR-002. The substrate (review.json shape, exit-code semantics, gate severities) is
  already covered by 004/007's suites.
- **Alternatives considered**: *Add an integration test that spins up a real GitHub Action* — out of
  scope for a docs feature and not reproducible locally. Rejected (the e2e in 007 already proves the
  chain).
