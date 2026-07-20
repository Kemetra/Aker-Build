# Feature Specification: Reusable GitHub CI Integration

**Feature Branch**: `020-reusable-github-ci`
**Created**: 2026-07-20
**Status**: Approved for implementation
**Input**: Turn the proven report-only GitHub Action contract and verified npm
artifact into a minimal reusable workflow for consumer repositories.

## Purpose

Aker Build dogfoods a repository-specific workflow, and Spec 008 documents a
copy/paste source-checkout example. Spec 017 now produces a self-contained npm
package, so consumers should not need to vendor this monorepo or install its
workspace dependencies. This feature provides a callable, version-pinned,
report-only workflow that checks the caller repository.

## Clarifications

### Session 2026-07-20

- **Recommended approach selected**: a reusable workflow, not a composite action
  or another copy/paste implementation. GitHub runs a called workflow as part of
  the caller and `actions/checkout` checks out the caller repository.
- The workflow is triggered only by `workflow_call`; adding it does not run CI in
  Aker Build or any consumer. The consumer explicitly opts in with its own
  `pull_request` caller workflow.
- The workflow hardcodes `aker-build@0.1.0`. Callers pin the reusable workflow by
  reviewed commit SHA (safest) or matching release tag. No mutable `latest` or
  caller-supplied package-version input is allowed.
- The only v1 input is boolean `fail-on-critical`, default `false`. Output stays
  fixed at `.aker-build`; gate subsets, queue-item scope, arbitrary output paths,
  and package overrides are deferred.
- The workflow runs `doctor --github`, then `scan`, then `review-pr <PR number>`.
  It uses PR-number mode, never `--local-diff`.
- The default remains report-only. Opt-in critical failure preserves the already
  approved Spec 008 rule (`severity == "critical"`); it is not roadmap P6's
  confirmed-only policy, audited override, or branch-protection product.
- npm publication, repository tag creation, pushing the workflow, and a live
  cross-repository run remain operator-owned. Local completion proves syntax,
  invariants, the exact package, and a reconstructed command chain.

## User Scenarios & Testing

### User Story 1 - Opt into PR review with a tiny caller (Priority: P1)

A consumer adds one PR-triggered job referencing Aker Build's reusable workflow
and receives the existing Markdown verdict in the GitHub run summary.

**Independent Test**: Parse the workflow and a documented caller, prove the
called file has only `workflow_call`, then trace checkout → doctor → scan →
PR-number review → always-run summary against the existing CLI/package contract.

**Acceptance Scenarios**:

1. **Given** a consumer `pull_request`, **When** its job calls the pinned reusable
   workflow, **Then** the caller repository's PR head is checked out and reviewed.
2. **Given** findings without an execution error, **When** the default input is
   used, **Then** findings are summarized and the job remains report-only.
3. **Given** a CLI/preflight error, **When** execution stops, **Then** the job
   fails and the summary step explains that no review was produced.

### User Story 2 - Preserve least privilege and source safety (Priority: P1)

A security-conscious maintainer can inspect the workflow and see that it cannot
write back to the repository or execute the consumer's dependency scripts.

**Independent Test**: Assert read-only permissions, checkout credential
non-persistence, exact package pinning, absence of workspace/package-manager
install commands, and absence of commit/push/comment/label/upload steps.

**Acceptance Scenarios**:

1. **Given** the called job, **When** permissions and steps are inspected,
   **Then** only `contents: read` and `pull-requests: read` are requested.
2. **Given** an untrusted PR checkout, **When** Aker Build runs, **Then** no
   consumer install/build/test script is executed.
3. **Given** checkout completes, **When** later steps run, **Then** no persisted
   checkout credential is available for a push.

### User Story 3 - Opt into the existing critical-severity rule (Priority: P2)

A consumer may enable the existing Spec 008 critical-only check without turning
ordinary findings or the Not-Ready verdict into a failing job.

**Independent Test**: Inspect and locally exercise the exact JavaScript predicate
against zero, non-critical, and critical finding arrays.

**Acceptance Scenarios**:

1. **Given** `fail-on-critical: false`, **When** critical findings exist, **Then**
   the enforcement step is skipped and the review remains report-only.
2. **Given** `fail-on-critical: true`, **When** a critical finding exists, **Then**
   the enforcement step fails and reports only the count.
3. **Given** only high/medium findings or a `not_ready` verdict, **When** the input
   is true, **Then** the enforcement step passes.

## Functional Requirements

- **FR-001**: Add one reusable workflow under `.github/workflows/` whose sole
  trigger is `workflow_call`.
- **FR-002**: The workflow MUST define boolean `fail-on-critical` with default
  `false` and MUST define no secret, package-version, path, gate, or item input.
- **FR-003**: The workflow MUST request only `contents: read` and
  `pull-requests: read`; no permission may be `write`.
- **FR-004**: Checkout MUST use the caller PR head and set
  `persist-credentials: false`.
- **FR-005**: Runtime MUST be Node `22.14` and invoke exact
  `aker-build@0.1.0` through `npx --yes`.
- **FR-006**: The command chain MUST be `doctor . --github` → `scan .` →
  `review-pr <PR number>` with fixed `--out .aker-build`.
- **FR-007**: The workflow MUST NOT use `--local-diff`, install consumer
  dependencies, run consumer scripts, or reference Aker Build monorepo source.
- **FR-008**: `GH_TOKEN` MUST be step-scoped from `github.token`, never accepted
  as a workflow secret/input, stored, or printed.
- **FR-009**: The summary step MUST use `if: always()`, append `review.md` when
  present, and emit a clear diagnostic when absent.
- **FR-010**: Optional enforcement MUST run only when `fail-on-critical` is true,
  parse `review.json` with Node (no `jq` dependency), and fail only when at least
  one finding has `severity === "critical"`.
- **FR-011**: Workflow and tests MUST contain no commit, push, PR comment,
  annotation, label, issue, artifact upload, auto-fix, agent execution, or merge.
- **FR-012**: A versioned consumer guide MUST show a minimal `pull_request`
  caller with matching read permissions and a pinned reusable-workflow ref.
- **FR-013**: Historical Spec 008/ADR-007 guidance MUST be marked superseded for
  external consumers without rewriting its original decision as current fact.
- **FR-014**: Local tests MUST parse the YAML and assert triggers, inputs,
  permissions, checkout safety, exact command chain, package pin, summary,
  enforcement predicate, and forbidden-token absence.
- **FR-015**: The existing package acceptance MUST remain the executable proof
  for `doctor`, `scan`, and `review-pr`; no live registry or GitHub mutation is
  part of local verification.

## Consumer Contract

```yaml
name: Aker Build
on:
  pull_request:

permissions:
  contents: read
  pull-requests: read

jobs:
  review:
    uses: Kemetra/Aker-Build/.github/workflows/aker-build-review.yml@v0.1.0
    with:
      fail-on-critical: false
```

GitHub repository Actions policy must allow the referenced public reusable
workflow. A full commit SHA is the safest production pin; the documented release
tag becomes usable only after the owner publishes npm `0.1.0` and creates that
reviewed repository tag.

## Non-Goals

```text
No automatic activation in Aker Build or a consumer repository.
No composite or JavaScript action package.
No mutable/latest package resolution.
No consumer dependency installation or project script execution.
No arbitrary inputs beyond fail-on-critical.
No PR comments, Checks annotations, artifacts, persistence, or source upload.
No public npm publish, tag, push, PR, or workflow dispatch.
No P5 dashboard or P6 enforcement product.
```

## Success Criteria

- **SC-001**: Static contract tests parse one callable-only workflow and validate
  100% of FR-001–FR-011 invariants.
- **SC-002**: The documented consumer caller is valid YAML and references the
  exact workflow path at release tag `v0.1.0`, with a full-SHA recommendation.
- **SC-003**: Local predicate tests classify critical/non-critical/empty fixtures
  correctly without exposing finding content.
- **SC-004**: `pnpm test`, `pnpm typecheck`, `pnpm test:cli-package`, benchmark,
  and first-run smoke remain green.
- **SC-005**: Changed-file audit finds zero manifest, lockfile, core engine,
  GitHub App, hosted surface, generated artifact, or remote change.

## Allowed Implementation Surface

```text
.github/workflows/aker-build-review.yml
.github/workflows/aker-build.yml (comments only)
packages/cli/tests/ci-workflow.test.ts
docs/ci/github-actions.md
docs/decisions/ADR-007-ci-runtime.md
docs/decisions/ADR-013-reusable-workflow-distribution.md
specs/008-github-action/quickstart.md
specs/008-github-action/contracts/action-inputs.md
README.md
docs/release/npm.md
docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md
docs/status/post-foundation-reconciliation.md
CLAUDE.md
.specify/feature.json
specs/020-reusable-github-ci/**
```

## Forbidden Surface

```text
package.json files and pnpm-lock.yaml
all production TypeScript packages and scripts
packages/github-app*/**
public registry writes, Git tags, pushes, PRs, or workflow dispatch
```

## Approval

The owner directed this session to choose and execute recommended actions. That
standing instruction approves this bounded design and planning transition; it
does not authorize publication or any remote activation.
