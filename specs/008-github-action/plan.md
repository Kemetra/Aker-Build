# Implementation Plan: GitHub Action

**Branch**: `008-github-action` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-github-action/spec.md`

## Summary

The CI delivery surface for the kernel. 008 documents how a repository runs TenantGuard on
`pull_request` and surfaces the scan + gate + **review verdict** in the CI run — reusing the existing
CLI (007's `review-pr`), not a new engine. Per the spec's four-place carve-out (Purpose, Non-Goals,
Assumptions, AC-008), **008 creates no live `.github/workflows/*.yml`** and **no new TypeScript**; the
deliverable is the **integration contract + an example workflow shown as documentation + an ADR** for
the CI runtime/packaging. Adopting the workflow is the consumer's separately-gated opt-in.

**Technical approach** (decided at this plan layer; see research.md):

1. **Pure CI wiring over 007's outputs** — the Action runs **checkout PR head → `tenantguard scan` →
   `tenantguard review-pr <number>`** and renders `review.md` (human summary) into the CI run, reading
   `review.json` for the machine verdict. No new package, no TS, no TDD suite (FR-002). See Research R1.
2. **PR-NUMBER mode in CI, not `--local-diff`** — `--local-diff` compares the working tree to HEAD,
   which after a CI checkout is empty (false "Ready" every run). PR mode sources changed files from
   `gh pr view` (base-relative). The PR-head checkout is still load-bearing — the gates read file
   **contents** from the working tree. See R2.
3. **Critical-gate-blocking reads `severity:"critical"`** from `review.json` (plus 004's TG-G9 critical
   aggregator) — NOT the verdict (any risk → `not_ready`) and NOT the exit code (Not-Ready exits 0).
   Documented as a small `jq` step over `review.json`. Satisfies SC-002 ∧ SC-003. See R3.
4. **CLI invocation in CI** — the CLI bin is a TypeScript file (`./src/bin.ts`); there is no published
   binary yet, so the example workflow runs it from a checkout of the TenantGuard tooling via a TS
   runner (pnpm + `tsx`). The runtime/packaging choice is recorded as **ADR-007**. See R4.

**No production code, no `.github/workflows/*.yml`, no `package.json`, no lockfile is created by this
feature** (AC-008). Implementation = documentation artifacts only, after `plan.md` + `tasks.md` review.

## Technical Context

**Language/Version**: N/A for new code — 008 produces **documentation** (Markdown contracts + an example
  YAML workflow embedded in docs). The wrapped engine is the existing TypeScript CLI (Node ≥20, per
  ADR-001 / root `engines`).
**Primary Dependencies**: The existing `tenantguard` CLI (007 `review-pr`, 004 gates, 003 scan); GitHub
  Actions as the host; the CI-provided token only (no stored credentials). For invoking the unbuilt TS
  CLI in CI: pnpm (corepack) + `tsx` (a TS runner) — recorded in ADR-007. **No new TenantGuard package.**
**Storage**: The Action writes only `review.json`/`review.md` to a CI workspace out-dir (007's
  read-only-on-repo guarantee carries over); nothing is committed.
**Testing**: No new unit suite (no new code). Validation is **documentation-level**: the example
  workflow's command chain is checked against the real CLI surface (007 `review-pr` contract + the
  existing e2e), and the critical-blocking `jq` against `review.json`'s real shape.
**Target Platform**: GitHub Actions runners (Linux); `pull_request` trigger.
**Project Type**: CI integration documentation (no source package).
**Performance Goals**: N/A (a CI job; bounded by scan+review, well under typical CI budgets).
**Constraints**: PR-trigger + re-run (FR-001); reuse the CLI, no separate engine, no new TS (FR-002);
  summary = verdict + findings + evidence (FR-003); optional critical-blocking via `severity:"critical"`
  (FR-004); read-only on the repo (FR-005, SC-004); no secrets in summary/logs (FR-006, SC-005); store
  no tokens (FR-007, SC-006); errors surface, never silent-pass (FR-008, SC-007); domain-neutral
  (FR-009). **No live workflow file** (AC-008).
**Scale/Scope**: One example workflow + contract + ADR; the live adoption is the consumer's.

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.* Against the 8 named principles.

| Principle | Relevance | Status |
|-----------|-----------|--------|
| I. Source Truth First | CI runs over current PR evidence (checked-out head); the summary reflects the live scan/review, never stale notes. | ✅ Pass |
| II. CLI First | **This feature embodies the principle's corollary** — the Action is a *delivery surface* over the canonical CLI, "later, separately approved", never a prerequisite for core value (constitution §II). Local `review-pr` is unchanged and still works with no CI. | ✅ Pass |
| III. Evidence-Based | The CI summary carries the verdict + findings with evidence (from `review.json`/`review.md`); no new claims. | ✅ Pass |
| IV. Spec-Compatible | The Action reviews any repo's PR; no Spec-Kit dependency imposed on consumers. | ✅ Pass |
| V. Agent Safety | CI surfaces the same gate/review verdict that scopes agent work — extending the safety loop to the collaboration surface. | ✅ Pass |
| VI. No Hidden Mutation | **Read-only**: no commit/push/merge/auto-comment/label/issue (FR-005); writes only to the CI workspace out-dir. Creating a *live* workflow (which would auto-activate CI) is deliberately deferred to the consumer (AC-008). | ✅ Pass |
| VII. No Secrets | Secret-like content is flagged, never printed in the summary/logs (FR-006); no tokens stored (FR-007). | ✅ Pass |
| VIII. Clean Extraction | Generic CI integration only — no Retail Tower / ERPNext / POS specifics (FR-009). | ✅ Pass |

**No gate violations — no Complexity Tracking entries required.** Docs-only: this plan creates no code
and no live workflow file; implementation produces documentation artifacts only, after review.

**Post-Phase-1 re-check:** the design (contract + example-workflow-as-docs + ADR-007, zero new TS, zero
live CI files) introduces no principle strain; all eight remain ✅. The discriminating check — *does any
artifact create a live `.github/workflows/*.yml`?* — is **no**.

## Project Structure

### Documentation (this feature)

```text
specs/008-github-action/
├── plan.md              # This file
├── research.md          # Phase 0 — CI wiring, checkout caveat, critical-blocking source, CLI-in-CI invocation
├── data-model.md        # Phase 1 — CI Run / CI Summary / Enforcement Mode entities + the inputs/outputs contract
├── quickstart.md        # Phase 1 — the EXAMPLE workflow (as docs) + adoption steps + acceptance mapping
├── contracts/
│   ├── action-inputs.md     # Phase 1 — Action inputs/env (fail-on-critical, out-dir, gates) + outputs (summary, check status)
│   └── ci-summary.md        # Phase 1 — CI summary content contract (verdict + findings + evidence, from review.md/json)
├── checklists/
│   └── requirements.md   # (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root) — NONE created by this feature

```text
docs/decisions/ADR-007-ci-runtime.md   # the ONLY new repo file at implementation time: CI runtime/packaging decision
                                       # (run the TS CLI via pnpm + tsx from a checkout; no published binary / no live workflow yet)

# NO packages/* changes. NO .github/workflows/*.yml. NO package.json / lockfile changes.
# The example workflow YAML lives INSIDE quickstart.md / contracts as documentation, not as a live file.
```

**Structure Decision**: 008 is a **documentation feature**. It adds spec artifacts (research/data-model/
contracts/quickstart) and **one ADR** (`ADR-007-ci-runtime.md`), and embeds an **example workflow as a
fenced code block in the docs** — deliberately *not* a live `.github/workflows/*.yml` (AC-008; a live
file auto-activates CI, an outward-facing opt-in for the consumer). No `packages/` code, no new tests,
no lockfile change. This plan **does not create** any of the above; the split is confirmable at
`/speckit-tasks`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
