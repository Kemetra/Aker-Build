# Feature Specification: Release Readiness and First-Run Demo

Status: Implemented in branch `010-release-readiness-and-first-run-demo`
Feature: `010-release-readiness-and-first-run-demo`
Date: 2026-06-19
Type: Release hardening / demo / documentation / smoke validation

## Purpose

This feature turns the implemented TenantGuard MVP chain into a reliable first-run experience for a new user.

It does not launch the product publicly by itself. It prepares the repo so the launch strategy in `009-launch-and-community-strategy` can be executed later without overclaiming.

## User stories

### US1: New user can run TenantGuard in minutes

A developer lands on the repository, follows the README quickstart, runs TenantGuard against a safe example repo, and sees meaningful output.

Acceptance:

- The quickstart is copy-pasteable.
- The user gets `project-map`, `risks`, `queue`, `route`, `prompt`, and `review` output.
- No maintainer explanation is required.

### US2: Maintainer can verify release readiness

A maintainer can run a single documented smoke sequence before launch.

Acceptance:

- The smoke sequence is documented.
- It exits non-zero on broken command wiring or missing expected outputs.
- It does not require GitHub credentials.

### US3: Contributor sees a clear on-ramp

A contributor can find setup instructions, contribution expectations, and scoped first issues.

Acceptance:

- `CONTRIBUTING.md` exists.
- README links to contribution flow.
- Good-first-issue guidance exists, even if actual issue creation happens separately.

## Functional requirements

- FR-001: Update docs so post-foundation status matches current `main`.
- FR-002: Update `packages/cli/README.md` to document all implemented commands.
- FR-003: Create or polish a sanitized example SaaS repo fixture under `examples/`.
- FR-004: Add a first-run demo guide that runs the full chain.
- FR-005: Add smoke validation for the demo path if implementation tasks approve test/script files.
- FR-006: Ensure demo output contains no secrets or private Retail Tower/ERPNext/POS domain logic.
- FR-007: Add or prepare repo readiness files needed by launch: `LICENSE`, `CONTRIBUTING.md`, README quickstart, roadmap link.
- FR-008: Mark `009` as a reviewed/accepted strategy if maintainers agree, without changing its strategic content.
- FR-009: Do not add hosted dashboard, GitHub App, auto-fix, auto-commit, or auto-merge behavior.

## Required outputs

Minimum docs-only outputs:

```text
docs/status/post-foundation-reconciliation.md
docs/roadmap/post-foundation-technical-plan.md
README.md quickstart update
packages/cli/README.md update
CONTRIBUTING.md
LICENSE, if not present
```

Implementation outputs only if allowed by plan/tasks:

```text
examples/multi-tenant-saas-basic/**
docs/demo/first-run.md
scripts/smoke-first-run.* or package script, if approved
tests for demo/golden outputs, if approved
```

## Non-goals

```text
No launch posts.
No marketing site.
No hosted dashboard.
No GitHub App.
No auto-fix.
No auto-commit.
No auto-merge.
No secrets.
No Retail Tower private domain logic.
No ERPNext-specific rules.
```

## Success criteria

- SC-001: A fresh user can complete the first-run demo from README alone.
- SC-002: All documented commands match actual CLI command wiring.
- SC-003: The demo proves the core value: evidence-backed risks, queue, route, prompt, and review.
- SC-004: The repo readiness checklist from 009 is either satisfied or has explicit remaining gaps.
- SC-005: The feature does not introduce deferred surfaces or hidden mutation.

## Dependencies

- Depends on `001-product-foundation` for positioning.
- Consumes implemented MVP chain from `003` through `007`.
- Consumes `008` dogfood/report-only posture.
- Unlocks execution of `009-launch-and-community-strategy` later.
- Does not block `011-spec-kit-adapter-and-config-boundary`, but should come first for launch confidence.
