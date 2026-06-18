# Implementation Plan: Launch & Community Strategy

**Branch**: `009-launch-and-community-strategy` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-launch-and-community-strategy/spec.md`

## Summary

009 is a **spec-is-the-deliverable** feature. Its Required Output is `spec.md` itself — a reviewed
launch & community strategy (purpose, audience, message, readiness + pre-launch checklists, channels,
content plan, growth loops, metrics, stages, non-goals). **SC-006 / FR-009 / AC-010 forbid any other
artifact** (no production / marketing-site / dashboard / App / package / lockfile / Action). There is
**no behavior to implement, no interface to contract, and no library/runtime to choose** — so this plan
deliberately produces **no `research.md`, no `data-model.md`, no `contracts/`, and no ADR.** Creating any
of those would manufacture an artifact the spec's own non-goals prohibit (the inverse of the 008 AC-008
risk).

**Technical approach**: none required. The "implementation" of a launch *strategy* is the reviewed
strategy document. The only legitimate new files for this feature are the spec-kit process artifacts
themselves (`plan.md`, `tasks.md`); the binding deliverable (`spec.md`) already exists and already
satisfies all 11 ACs. Downstream `/speckit-tasks` and `/speckit-implement` legitimately produce almost
nothing beyond confirming each requirement is met and, at most, minor refinements to `spec.md` (e.g.
flipping the content-theme claims from aspirational to **verified-against-merged-code**, since 004/006/007
are now shipped).

## Technical Context

**Language/Version**: N/A — no code. The deliverable is a Markdown strategy document.
**Primary Dependencies**: `001-product-foundation` (positioning, MVP scope, non-goals, principles). The
  content plan references shipped capabilities (004 gates, 006 prompt, 007 review) for the no-vaporware
  guarantee (SC-002).
**Storage**: N/A.
**Testing**: N/A (no executable artifact). Validation is documentation-level: each AC/SC is checked
  against the spec's own content, and the content-theme→capability mapping is checked against merged code.
**Target Platform**: N/A — a reviewable plan, executed later by the maintainer when the CLI MVP is
  reviewed.
**Project Type**: Strategy documentation (no source).
**Performance Goals / Constraints / Scale**: N/A.
**Key constraint**: produce **nothing beyond `spec.md`** (+ the spec-kit process files). The 009
tripwire for every downstream stage: *does this create or require any file other than `spec.md`?* If
yes, it violates SC-006 / FR-009 / AC-010.

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.* Against the 8 named principles.

| Principle | Relevance | Status |
|-----------|-----------|--------|
| I. Source Truth First | The content plan's claims are bound to **shipped** capabilities (SC-002) — verified against merged 004/006/007 code, not roadmap promises; no overclaiming (FR-005, message guardrail). | ✅ Pass |
| II. CLI First | The launch markets the local CLI; it does not introduce any non-CLI surface or prerequisite (FR-010 — blocks nothing). | ✅ Pass |
| III. Evidence-Based | Every content theme maps to a demonstrable CLI output (a finding, a prompt, a verdict) — content demonstrates the tool, not vaporware (FR-005). | ✅ Pass |
| IV. Spec-Compatible | A strategy doc; imposes no methodology on users. | ✅ Pass |
| V. Agent Safety | The very message marketed ("safe task boundaries", "never commits/pushes/merges") is Principle V — the launch communicates the safety contract, doesn't weaken it. | ✅ Pass |
| VI. No Hidden Mutation | Growth loops are **opt-in and honest** (no dark patterns, no forced attribution); marketing applies the same no-hidden-mutation ethos (FR-006, Non-Goals). | ✅ Pass |
| VII. No Secrets | FR-011 / AC-011: no secrets in repo, demo output, screenshots, or example repo. | ✅ Pass |
| VIII. Clean Extraction | Domain-neutral positioning — no Retail Tower / ERPNext / POS content (FR-012). | ✅ Pass |

**No gate violations — no Complexity Tracking entries required.** This plan creates no code and no
non-spec artifact.

**Post-Phase-1 re-check:** there is no Phase-1 design (no entities, no contracts) — by design. The
single deliverable (`spec.md`) introduces no principle strain; all eight remain ✅. The discriminating
check — *does any artifact beyond `spec.md` get created?* — is **no**.

## Project Structure

### Documentation (this feature)

```text
specs/009-launch-and-community-strategy/
├── spec.md              # THE DELIVERABLE — the reviewed launch & community strategy
├── plan.md              # This file (spec-kit process artifact)
├── checklists/
│   └── requirements.md  # (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (process artifact; NOT created here)

# Intentionally ABSENT (a strategy doc has no interface/behavior to design):
#   research.md       — no NEEDS CLARIFICATION; deferred items are explicitly deferred by the spec
#   data-model.md     — no entities/types/schema
#   contracts/        — no interface this feature exposes
#   docs/decisions/ADR-* — NO ADR: license is deferred (readiness needs *a* OSI license, not a choice);
#                          an ADR would manufacture an artifact the spec's non-goals forbid
```

### Source Code (repository root) — NONE

```text
# NO packages/* · NO .github/workflows/* · NO package.json / lockfile · NO marketing-site / dashboard /
# App code · NO assets. The Required Output is spec.md and nothing else (SC-006 / FR-009 / AC-010).
```

**Structure Decision**: 009 produces **only the strategy document** (`spec.md`) plus the spec-kit
process files (`plan.md`, `tasks.md`). No Phase-0 research and no Phase-1 design artifacts are created —
not as an omission, but because a launch *strategy* has no behavior, interface, data model, or technology
choice to design. The deferred items (license, example repo, star thresholds, npm distribution) are
deliberately deferred by the spec to other specs/waves and are not 009's to resolve.

## Complexity Tracking

> No Constitution Check violations. No entries required.
