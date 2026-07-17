# Implementation Plan: 014 Report-Only GitHub App

Status: Implemented with evidence-linked follow-up gaps (reconciled by 016 on 2026-07-17)
Feature: `014-github-app-report-only`
Date: 2026-06-21
Spec: `specs/014-github-app-report-only/spec.md`

## Summary

Productize the existing report-only dogfood GitHub Action behavior as an installable, self-hostable GitHub App (roadmap P4, EXPAND phase). On each pull request, the App runs the existing `review-pr` chain at the PR head ref and posts the result as a GitHub Checks run plus inline annotations, using the `file:line` evidence spans and confidence tiers already produced by the merged P1/P2 work and rendered by the merged report-only Checks renderer. The App is report-only and stateless: it sets a check status and annotations; it never commits, pushes, merges, auto-fixes, executes agents, or persists source/secrets.

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (`engines.node >=22.13`, matching the repo).
**Primary Dependencies**: existing workspace packages `@aker-build/review`, `@aker-build/report`, `@aker-build/config`, `@aker-build/scanner`, `@aker-build/gates`; GitHub integration via Octokit-style REST client and webhook signature verification. No new judgment engine.
**Storage**: None (stateless by default — no stored source/secrets). Per-PR compute only.
**Testing**: Vitest, consistent with all existing packages. GitHub API and webhook payloads are mocked/faked at the boundary; no live network in tests.
**Target Platform**: A self-hostable Node service/runner an org deploys itself (per spec Clarifications). Exact host topology (long-running webhook server vs. on-demand runner) is resolved in research.md.
**Project Type**: New workspace package in the existing pnpm monorepo — an integration/adapter layer over the CLI's review chain. CLI-first principle preserved: the App is a thin transport over the same engine the CLI uses.
**Performance Goals**: Per-PR review completes within a single check lifecycle; no throughput target (single-tenant, event-driven). Honest non-error status on timeout (FR-011).
**Constraints**: Report-only (no repo mutation beyond Checks/annotations); stateless; no stored secrets/source; ≤50 prominent annotations per check (FR-006); verdict must match CLI `review-pr` for the same diff (FR-013).
**Scale/Scope**: Single repository/org per installation; one in-flight review per PR head; updates (not duplicates) its check on synchronize (FR-012).

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` (v1.0.0, 8 principles).*

| Principle | Verdict | Justification |
|---|---|---|
| I. Source Truth First | PASS | Reviews source at the PR head ref; no assertion from memory. |
| II. CLI First | PASS | The App is a transport over the same `review-pr` engine the CLI exposes; it adds no new core value and is not a prerequisite for the CLI. |
| III. Evidence-Based Findings | PASS | Every annotation carries `file:line` evidence from the existing confidence model; no evidence-free findings introduced. |
| IV. Spec-Compatible, Not Spec-Kit-Dependent | PASS | Reviews any repo; reuses config defaults (incl. 013 path scope); does not require the reviewed repo to use Spec Kit. |
| V. Agent Safety by Default | N/A | This feature generates no AI-agent prompts and executes no agents. |
| VI. No Hidden Mutation | PASS (gate cleared 2026-06-21) | The App writes ONLY a Checks run + annotations — not a repository mutation (no commit/push/merge/auto-fix/agent-exec) — so Principle VI's mutation prohibition is untouched. The earlier scope gate (MVP "no GitHub App") is now **cleared**: the roadmap `docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md` is owner-approved (2026-06-21), and constitution **v1.1.0** moves a report-only GitHub App from MVP MUST-NOT to an approved post-MVP surface (P4 only). CLAUDE.md Current Phase reflects this. Approval covers P4 only; P5/P6 remain unapproved. |
| VII. No Secrets | PASS | Stateless; stores nothing; reuses existing secret-safety (detect-and-flag, never capture/print) for config and diff content (FR-009). |
| VIII. General SaaS Kernel — Clean Extraction | PASS | No Retail Tower / ERPNext logic; pure GitHub-integration layer over the generic engine. |

**Gate result: PASS.** The App adds no mutation capability (Principle VI's mutation wall holds), and the prior governance gate is **cleared as of 2026-06-21**: the roadmap is owner-approved and constitution v1.1.0 permits a report-only GitHub App as an approved P4 surface. Implementation via `/speckit-implement` is now governance-eligible (still subject to the normal reviewed-artifact workflow and the report-only/stateless/secret-safe constraints). See Complexity Tracking.

## Package boundary

```text
packages/github-app   (new)
  verify webhook signature; map PR events -> review requests
  invoke @aker-build/review review-pr chain at the PR head ref
  consume @aker-build/report / Checks renderer payload (PR #24 work)
  apply tier-driven presentation + <=50-annotation bound
  set Checks conclusion (neutral for drafts; failure only on confirmed)
  ZERO writes outside the Checks/annotations API

packages/review       (reuse, read-only consumer)
packages/report        (reuse - Checks payload renderer)
packages/config        (reuse - defaults incl. 013 path scope)
packages/scanner, packages/gates (reuse - invoked via review chain)
```

## Project Structure

### Documentation (this feature)

```text
specs/014-github-app-report-only/
├── spec.md          # done (/speckit-specify + /speckit-clarify)
├── plan.md          # this file
├── research.md      # Phase 0 - host topology, webhook auth, Checks API limits
├── data-model.md    # Phase 1 - Installation, PR Review Event, Check Run, Annotation
├── contracts/       # Phase 1 - webhook intake + Checks output contract
├── quickstart.md    # Phase 1 - install + first-PR walkthrough
└── tasks.md         # (/speckit-tasks - not created here)
```

### Source Code (repository root)

```text
packages/github-app/
├── src/
│   ├── webhook.ts        # signature verify + event filter (opened/reopened/synchronize/draft)
│   ├── review-runner.ts  # invoke review-pr chain at head ref
│   ├── checks.ts         # map findings -> Checks run + annotations (tier presentation, <=50 bound)
│   ├── safety.ts         # assert write-allowlist (checks/annotations only)
│   └── index.ts          # entry: deployable handler
└── tests/
    ├── webhook.test.ts
    ├── review-runner.test.ts
    ├── checks.test.ts          # confirmed->failure, suspected->collapsed, draft->neutral, <=50 cap
    └── safety.test.ts          # no write outside checks/annotations
```

**Structure Decision**: One new package `packages/github-app`, matching the established monorepo pattern (each feature is its own focused package consuming public exports of others — same as `report`/`review`). No changes to existing package internals; the App is a strict downstream consumer.

## Scope

Allowed files:

```text
packages/github-app/**
specs/014-github-app-report-only/**
contracts/ (new webhook + checks-output contract for this feature, additively)
packages/review/** only if a read-only export is needed (no behavior change)
packages/report/** only if a read-only export is needed (no behavior change)
CLAUDE.md active feature pointer only
pnpm-lock.yaml only for the new workspace package manifest
README.md / packages/cli/README.md only to document the App surface
```

Forbidden files:

```text
Any code that commits, pushes, merges, labels, or modifies repo contents
Auto-fix / auto-merge / agent execution
Hosted multi-tenant dashboard (that is P5)
Enforcing / blocking-merge logic (that is P6)
Persistent storage of source code or secrets
Changes to existing gate/scanner/review JUDGMENT behavior
Broad rewrites unrelated to the App transport layer
```

## Validation

Required:

```bash
pnpm --filter @aker-build/github-app test
pnpm test
pnpm typecheck
```

Focused scenarios (mirror spec acceptance):

```text
opened PR -> a Checks run is created at head (US1)
confirmed finding -> annotation at correct file:line + non-success conclusion (US1/US2)
suspected-only -> neutral conclusion, collapsed advisory notes (US2)
draft PR -> neutral conclusion regardless of findings (FR-015)
>50 findings -> <=50 annotations, remainder summarized in body (FR-006/SC-005)
synchronize -> existing check updated, not duplicated (FR-012)
fork / missing-permission / timeout -> honest non-error status, never false ready (FR-011)
verdict matches CLI review-pr for the same diff (FR-013/SC-006)
no write performed outside checks/annotations API (FR-007/SC-003)
nothing persisted: zero source bytes, zero secret values (FR-008/FR-009/SC-004)
```

## Stop conditions

Stop and report if:

- Implementation would require any repository write beyond the Checks/annotations API.
- The App would need to persist source code or secret values to function.
- Delivering the App requires changing existing gate/scanner/review judgment behavior.
- The work drifts toward P5 (aggregation/dashboard) or P6 (enforcing/blocking merge).
- A new ADR is needed (e.g., webhook auth model) and is not yet approved.

## Complexity Tracking

| Item | Why needed | Why the constitution still holds |
|---|---|---|
| New GitHub App surface (post-MVP) | Roadmap P4 (approved 2026-06-21) — put proven findings where review happens (reach) | Approved: roadmap owner-approved + constitution v1.1.0 permits a report-only GitHub App as a P4 surface. Report-only, so Principle VI's mutation wall is untouched (a Checks status is not a repo mutation). Governance gate cleared. |
| New `packages/github-app` package | Transport layer needs its own boundary | Matches existing one-package-per-feature pattern; consumes public exports only, adds no new judgment engine (CLI-first preserved). |
