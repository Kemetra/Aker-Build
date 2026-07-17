# Feature Specification: Source Truth and CI Baseline

**Feature**: `016-source-truth-ci-baseline`
**Created**: 2026-07-17
**Status**: Implemented locally; hosted/manual handoff remains pending
**Program**: `docs/superpowers/specs/2026-07-17-production-trust-and-expansion-program-design.md`

## Purpose

Aker Build sells source-truth discipline and safe verification, but its own repository currently
contains stale GitHub App status statements, incomplete historical task ledgers, Git fixtures that
can inherit a maintainer's signing configuration, and CI that does not run the complete workspace
quality gates. This feature makes the repository an accurate and continuously checked example of
the product's promise.

This is a reconciliation and verification slice. It does not change detector judgment, review
verdicts, the GitHub App runtime, CLI behavior, or any deferred product surface.

## User Scenarios and Testing

### User Story 1 - Maintainers and operators see one truthful product state (Priority: P1)

A maintainer or GitHub App operator reads the root and package documentation and sees the runtime
that actually exists, every required environment variable, the complete minimum permission set,
and an evidence-linked account of what 014 and 015 implemented.

**Why this priority**: Stale source truth sends contributors toward already-completed work and can
cause an operator to configure an App that cannot read pull-request metadata.

**Independent test**: Repository contract tests read the relevant Markdown and task ledgers and
assert the canonical App status, four runtime variables, four permissions, and absence of the known
stale "remaining wiring" statements.

**Acceptance scenarios**:

1. **Given** a new operator, **when** they follow the App instructions, **then** they see
   `AKER_BUILD_APP_ID`, `AKER_BUILD_APP_PRIVATE_KEY`, `AKER_BUILD_WEBHOOK_SECRET`, and
   `AKER_BUILD_INSTALLATION_ID` and no secret value is committed.
2. **Given** an installer reviewing permissions, **when** they compare all App docs, **then** every
   document names `metadata: read`, `contents: read`, `pull_requests: read`, and `checks: write`,
   with only the `pull_request` webhook subscription.
3. **Given** a contributor reading the repository, **when** they inspect README, CLAUDE guidance,
   014, and 015, **then** none claim that the App, HTTP host, Octokit adapter, or real Git runner is
   still deferred or unwired.
4. **Given** a historical 014 or 015 task, **when** its completion mark is inspected, **then** it is
   linked to implementation/test evidence; anything not proven remains unchecked with a reason.

---

### User Story 2 - Every pull request gets deterministic quality evidence (Priority: P1)

A contributor opens a pull request and receives workspace tests, typechecking, benchmark,
first-run smoke, and platform-compatibility results without depending on their personal Git setup.

**Why this priority**: The existing dogfood and benchmark jobs do not prove the full workspace is
green. Local test repositories also fail when a machine globally requires signed commits.

**Independent test**: Run the complete suite with process-scoped Git configuration that requires an
invalid signing key. The suite still passes because every committing fixture disables signing in
its own repository. CI contract tests prove the required jobs and platforms are present.

**Acceptance scenarios**:

1. **Given** a pull request, **when** CI runs, **then** `pnpm test`, `pnpm typecheck`, the explicit
   benchmark gate, and the first-run smoke are executed.
2. **Given** supported platforms, **when** CI runs, **then** full tests and typechecking execute on
   Ubuntu, Windows, and macOS.
3. **Given** the package engine contract, **when** CI runs, **then** one job uses Node `22.13.x` and
   primary platform jobs use Node 24 LTS.
4. **Given** global `commit.gpgsign=true` with an invalid signing key, **when** the full suite runs,
   **then** test-created repositories commit successfully without changing global Git config.
5. **Given** the existing dogfood review, **when** the workflow is hardened, **then** its findings
   remain advisory and no mutation or merge enforcement is added.

---

### User Story 3 - Repository owners receive supply-chain signals (Priority: P2)

A repository owner gets immutable Action dependencies, automated update proposals, static analysis,
and a production-dependency audit with a documented security-reporting and protection policy.

**Why this priority**: Verification code is only trustworthy when its own execution dependencies
and permissions are bounded and observable.

**Independent test**: Workflow contract tests reject non-SHA Action references and missing audit,
CodeQL, Dependabot, ownership, or security-policy files; the production audit is run separately.

**Acceptance scenarios**:

1. **Given** a workflow action reference, **when** it is inspected, **then** it uses a full 40-character
   commit SHA with a release comment.
2. **Given** npm or GitHub Action dependencies, **when** updates are available, **then** Dependabot is
   configured to propose grouped weekly updates.
3. **Given** TypeScript/JavaScript changes, **when** the security workflow runs, **then** CodeQL
   analyzes the repository with least-privilege permissions.
4. **Given** production dependencies, **when** the audit job runs on pull requests and its schedule,
   **then** `pnpm audit --prod` fails on a reported vulnerability and never applies an automatic fix.
5. **Given** a security reporter or branch-protection administrator, **when** they inspect repository
   policy, **then** they find a responsible-disclosure path, code ownership, and exact required-check
   names. Enabling branch protection remains an explicit repository-settings action.

## Functional Requirements

- **FR-001**: Root, package, operator, and active-agent documentation MUST describe the App host and
  adapters as implemented while keeping hosted dashboard, enforcement, auto-fix, auto-commit,
  auto-merge, and agent execution deferred.
- **FR-002**: App documentation MUST consistently name the minimum permissions `metadata: read`,
  `contents: read`, `pull_requests: read`, and `checks: write`, and only the `pull_request` webhook.
- **FR-003**: Runtime documentation MUST name all four required variables without showing real
  values: `AKER_BUILD_APP_ID`, `AKER_BUILD_APP_PRIVATE_KEY`, `AKER_BUILD_WEBHOOK_SECRET`, and
  `AKER_BUILD_INSTALLATION_ID`.
- **FR-004**: Legacy live-smoke variables with the `TG_SMOKE_` prefix MUST be replaced by the
  `AKER_BUILD_SMOKE_` prefix in tests and documentation.
- **FR-005**: 014 and 015 spec, plan, and task statuses MUST be reconciled against code and test
  evidence. Unproven work MUST NOT be marked complete.
- **FR-006**: 015 acceptance evidence MUST classify each claim as automated, gated live smoke,
  manual operator verification, or unmet.
- **FR-007**: Every pull request MUST run the complete workspace tests and typecheck.
- **FR-008**: CI MUST retain an explicit benchmark job even though the benchmark contract is also
  exercised by the workspace tests.
- **FR-009**: CI MUST run the first-run smoke on Ubuntu and Windows and MUST run full tests and
  typecheck on Ubuntu, Windows, and macOS.
- **FR-010**: CI MUST cover Node `22.13.x` as the minimum-supported version and Node 24 as the
  current LTS primary line.
- **FR-011**: Every test-created Git repository that commits MUST configure local identity,
  `commit.gpgsign=false`, and a non-inherited hooks path before its first commit.
- **FR-012**: Tests MUST NOT change system or global Git configuration.
- **FR-013**: All GitHub Actions MUST be pinned to reviewed full commit SHAs and retain a readable
  release-version comment.
- **FR-014**: Dependabot MUST track both the root npm/pnpm workspace and GitHub Actions weekly.
- **FR-015**: CodeQL MUST analyze `javascript-typescript` on pull requests, the default branch, a
  schedule, and manual dispatch with least-privilege token permissions.
- **FR-016**: A production-dependency audit MUST run on pull requests, the default branch, a
  schedule, and manual dispatch using `pnpm audit --prod` without automatic remediation.
- **FR-017**: Repository policy MUST include `SECURITY.md`, `.github/CODEOWNERS`, and an operator
  document listing recommended required checks and the external branch-protection step.
- **FR-018**: Repository-level contract tests MUST fail if required workflows, immutable action
  references, canonical App configuration, or baseline policy files drift.

## Non-Functional Requirements

- **NFR-001 — Report-only**: No change may add code mutation, merge enforcement, agent execution,
  or a repository write outside existing Checks behavior.
- **NFR-002 — Secret safety**: Tests, fixtures, workflow files, documentation, and logs MUST contain
  no credential value; examples use obvious placeholders only.
- **NFR-003 — Least privilege**: Each workflow MUST declare the smallest practical `GITHUB_TOKEN`
  permissions for its jobs.
- **NFR-004 — Determinism**: CI installs with `--frozen-lockfile`; no dependency or lockfile change
  is permitted in this slice.
- **NFR-005 — Honest evidence**: CodeQL execution and branch-protection enablement cannot be claimed
  from local validation; their first hosted run/settings confirmation remain explicit handoff items.

## Success Criteria

- **SC-001**: Contract tests find zero stale App-host/adaptor claims in the scoped docs.
- **SC-002**: Contract tests find all four runtime variables and all four permissions in canonical
  operator documentation.
- **SC-003**: Every 014/015 task has linked evidence or remains unchecked with a concrete reason.
- **SC-004**: `pnpm test` passes with a process-scoped invalid global signing configuration and no
  global Git mutation.
- **SC-005**: `pnpm typecheck`, benchmark, and first-run smoke pass locally and in their CI jobs.
- **SC-006**: CI contract tests prove Ubuntu, Windows, macOS, Node `22.13.x`, and Node 24 coverage.
- **SC-007**: CI contract tests find zero mutable Action tag references.
- **SC-008**: `pnpm audit --prod` reports zero production dependency vulnerabilities at merge time.
- **SC-009**: Hosted CodeQL and security workflows have a successful first run before repository
  protection is treated as operationally complete.

## Assumptions

- The default branch is `main`; workflows also run for pull requests independent of branch name.
- `Kemetra/Aker-Build` is the canonical GitHub repository and `@Kemetra` is the initial code owner.
- GitHub-hosted runners satisfy the runner version required by the pinned 2026 Action releases.
- Node 22 remains supported because `package.json` declares `>=22.13`; Node 24 is the current LTS
  primary line as of 2026-07-17.
- The first-run smoke remains a PowerShell script in 016. Cross-platform packaged-binary smoke is
  owned by 020.

## Out of Scope

- Runtime queues, timeouts, resource budgets, and webhook acknowledgment changes (017).
- Diff-aware finding identity or lifecycle semantics (018).
- New detectors, framework packs, or benchmark corpus expansion (019).
- npm publishing, bundled CLI artifacts, `init`/`doctor`/`check`, or Action product packaging (020).
- MCP server or MCP tools (021).
- Hosted dashboard/org aggregation (P5), merge enforcement (P6), or AI-agent execution.

## External Review Record

The owner delegated review authority on 2026-07-17 and requested an external-review posture. The
review treated the proposal as untrusted and checked it against the repository, current official
Node/GitHub Action sources, and locally observed failures.

| Finding | Resolution |
|---|---|
| The design called Node 22 the primary current line, but Node 24 is current LTS. | Keep `22.13.x` as the minimum gate; use Node 24 for primary platform jobs. |
| Marking every historical task complete could fabricate evidence. | Require per-task evidence; leave any gap unchecked with a reason. |
| Branch protection cannot be proven by committed files. | Document exact check names and make settings enablement/first hosted run an explicit handoff. |
| CodeQL and audit jobs can accidentally receive broad token permissions. | Put permissions at workflow/job scope and test the workflow contract. |
| Mutable action tags weaken the supply-chain claim. | Pin reviewed releases to full SHAs and let Dependabot update them. |
| Personal Git signing caused real suite failures. | Configure every committing fixture locally and validate under a poisoned process-scoped signing config. |
| A PowerShell smoke does not prove packaged cross-platform distribution. | Run it on Ubuntu/Windows here; reserve clean packaged smoke on all OSes for 020. |

**Review verdict**: Approved. The scope is bounded, acceptance is falsifiable, external-only steps
are labeled, and no deferred product behavior is authorized.
