# Feature Specification: Immutable GitHub Action Pins

**Feature Branch:** `021-immutable-action-pins`
**Created:** 2026-07-20
**Status:** Approved for implementation
**Input:** Remove mutable action-tag execution and persisted checkout
credentials from every repository workflow.

## Purpose

Spec 020 made the reusable consumer workflow versioned and read-only, but the
repository's three workflows still invoke official actions through mutable major
tags. GitHub can enforce full-length SHA pins, and a reviewed SHA is the only
reference that guarantees the exact action code. This polish closes that final
supply-chain gap consistently across consumer, dogfood, and release workflows.

## Decisions

- Pin every step-level `uses` reference under `.github/workflows/*.yml` to a
  full 40-character commit SHA with an adjacent human-readable release comment.
- Allow only official `actions/checkout` v6.0.2 at
  `de0fac2e4500dabe0009e67214ff5f5447ce83dd` and `actions/setup-node` v6.4.0 at
  `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`.
- These exact SHAs were verified directly with `git ls-remote` against the two
  official GitHub repositories on 2026-07-20.
- Upgrade remaining v4 references to those reviewed v6 releases. Every affected
  job uses a GitHub-hosted runner, which satisfies the v6 runner requirements.
- Set `persist-credentials: false` on every checkout, including dogfood and
  release jobs. No workflow performs an authenticated Git operation afterward.
- Preserve triggers, permissions, Node versions, package commands, environment
  boundaries, job structure, and release behavior.

## Requirements

- **FR-001:** All 14 current step-level action references MUST be full-length
  lowercase hexadecimal SHAs; no tag, branch, or shortened SHA may remain.
- **FR-002:** Every checkout reference MUST equal the approved checkout SHA and
  carry comment `v6.0.2`.
- **FR-003:** Every setup-node reference MUST equal the approved setup-node SHA
  and carry comment `v6.4.0`.
- **FR-004:** Every checkout step MUST set `persist-credentials: false`.
- **FR-005:** The reusable workflow's existing trigger/input/permission/command
  and predicate contract MUST remain unchanged.
- **FR-006:** The dogfood and npm-release workflows MUST retain their existing
  triggers, jobs, permissions, commands, and Node versions.
- **FR-007:** A static test MUST enumerate every workflow YAML file, inspect
  every `uses`, reject mutable/unknown references, and enforce checkout safety.
- **FR-008:** Documentation MUST state the pinned releases and controlled update
  procedure without claiming automatic upgrades.
- **FR-009:** No manifest, lockfile, product source, new action, Dependabot/
  Renovate configuration, secret, permission, remote tag, push, or dispatch.

## Success Criteria

- **SC-001:** Static tests find exactly three workflows, 14 external action
  references, zero mutable refs, zero unknown actions, and zero credential-
  persisting checkouts.
- **SC-002:** Focused workflow tests, full workspace tests/typecheck, package
  acceptance, namespace, benchmark, and first-run smoke remain green.
- **SC-003:** The changed-file audit contains only the three workflow files,
  existing workflow contract test/docs, and Spec 021 control documents.

## Allowed Surface

```text
.github/workflows/aker-build-review.yml
.github/workflows/aker-build.yml
.github/workflows/npm-release.yml
packages/cli/tests/ci-workflow.test.ts
docs/ci/github-actions.md
docs/decisions/ADR-013-reusable-workflow-distribution.md
docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md
CLAUDE.md
.specify/feature.json
specs/021-immutable-action-pins/**
```

## Non-Goals

```text
No workflow trigger, permission, command, input, job, or release-policy change.
No new external action or automated dependency updater.
No self-hosted runner support commitment.
No npm publication, tag, push, PR, or workflow dispatch.
No P5 or P6 work.
```

## Approval

The owner's standing direction selects recommended local polish. It authorizes
this bounded implementation and local integration, not any remote activation.
