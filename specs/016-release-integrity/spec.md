# Feature Specification: Release Integrity

**Feature Branch**: `016-release-integrity`
**Created**: 2026-07-20
**Status**: Implemented — owner-approved and fully verified 2026-07-20
**Input**: User direction: prioritize release confidence before adding new product surfaces; choose the recommended defaults without blocking on clarification.

## Clarifications

### Session 2026-07-20

- Q: Should release repair, one-command activation, npm distribution, framework expansion, and App deployment packaging ship as one feature? → A: No. This feature is the smallest prerequisite slice: restore a reproducible green repository and reconcile active product truth. One-command activation and npm distribution follow in spec 017; detector coverage and deployment packaging remain separate slices.
- Q: How should legacy `TenantGuard` references be handled? → A: Active executable code, tests, manifests, workflows, generated runtime identifiers, and current user-facing documentation must use `Aker Build` / `@aker-build`. Historical design records may retain the former name only when they are clearly historical and are explicitly excluded from the active-surface check.
- Q: Does this feature change detection, gate, queue, prompt, review, or GitHub App behavior? → A: No. Changes are limited to rename completion, verification/CI coverage, and documentation truth. Public output contracts and verdict semantics remain unchanged.
- Q: Must live GitHub credentials be available for the release-integrity gate? → A: No. The required gate must run deterministically without production credentials or network-dependent live smoke tests. Existing opt-in live checks remain supplemental.

## User Scenarios & Testing

### User Story 1 - Reproduce a green repository from a clean checkout (Priority: P1)

A maintainer checks out the current revision, installs locked dependencies, and runs the documented verification commands. Unit/integration tests, type-checking, the benchmark regression gate, and the first-run smoke path all complete successfully without manual file edits, private credentials, or undocumented setup.

**Why this priority**: Aker Build's public value depends on trusted, reproducible findings. A failing evaluation package makes the benchmark claim unverifiable and blocks every later release or feature decision.

**Independent Test**: From a clean checkout with the documented Node and pnpm versions, install with the frozen lockfile and run the complete local release-integrity command set. Every required command exits successfully and leaves tracked source unchanged.

**Acceptance Scenarios**:

1. **Given** a clean checkout with locked dependencies installed, **When** the maintainer runs the workspace test suite, **Then** every package test completes successfully.
2. **Given** the same checkout, **When** the maintainer runs workspace type-checking, **Then** every package type-checks with no unresolved legacy package imports.
3. **Given** the labeled benchmark corpus, **When** the benchmark command runs, **Then** it executes the real scan-to-gates pipeline, satisfies the committed thresholds, and regenerates the documented scorecard without manual correction.
4. **Given** the documented example repository, **When** the first-run smoke path runs, **Then** the full CLI chain succeeds and produces the expected Aker Build artifacts.
5. **Given** any required verification command, **When** it completes, **Then** it does not require GitHub App credentials, persist repository source outside its temporary workspace, or mutate tracked files.

---

### User Story 2 - Prevent release regressions in pull requests (Priority: P1)

A maintainer opens a pull request and receives automated evidence for the same release-critical checks used locally. A stale package namespace, broken type boundary, failing test, benchmark regression, or broken first-run path cannot appear green in CI.

**Why this priority**: Repairing the current rename regression once is insufficient. The repository must prevent the same class of drift before npm distribution and broader adoption begin.

**Independent Test**: Introduce a controlled stale legacy package import in an active source fixture and verify CI-equivalent validation fails with the offending path; restore it and verify the complete CI-equivalent command set passes.

**Acceptance Scenarios**:

1. **Given** a pull request, **When** CI runs, **Then** workspace tests and type-checking are explicit required jobs or steps rather than incidental coverage from another command.
2. **Given** an active executable or user-facing file containing an unapproved legacy product/package identifier, **When** namespace-integrity validation runs, **Then** it fails and reports the exact path.
3. **Given** a benchmark threshold regression, **When** CI runs, **Then** the benchmark job fails and the public scorecard is not represented as newly verified.
4. **Given** a failure in the documented first-run path, **When** CI runs the smoke validation, **Then** the pull request receives a failing result rather than a green release-integrity signal.
5. **Given** historical records that legitimately name the former project, **When** namespace validation runs, **Then** only explicitly documented historical paths are excluded; broad directory or repository-wide exclusions are not permitted.

---

### User Story 3 - Read an accurate capability and release status (Priority: P2)

A prospective user or contributor reads the root and package documentation and sees one coherent account of what is implemented, what is deployable, what is not yet published, and what remains limited. They are not told that a shipped App surface is deferred or that completed production wiring is still missing.

**Why this priority**: Contradictory status documentation undermines trust and causes maintainers to plan from stale assumptions even when the code itself works.

**Independent Test**: Compare the root README, current roadmap/status guidance, active feature pointer, GitHub App READMEs, and 014/015 delivery records against the current source tree and recent verification evidence. Every active claim maps to concrete code, tests, or an explicit limitation.

**Acceptance Scenarios**:

1. **Given** the implemented report-only GitHub App and server packages, **When** a reader opens current documentation, **Then** the packages' implemented and operator-owned boundaries are described consistently.
2. **Given** that the npm CLI is not yet published, **When** a reader follows the quickstart, **Then** documentation clearly distinguishes the current source-first path from the planned public installation path.
3. **Given** current detector limitations, **When** a reader reviews the benchmark and limitations sections, **Then** coverage claims remain bounded to what the corpus and recognizers actually prove.
4. **Given** specs 014 and 015, **When** a maintainer reviews their status and task records, **Then** completed work is reconciled against commit/test evidence and incomplete or operator-owned work remains explicit.
5. **Given** multiple active documentation surfaces, **When** their status statements are compared, **Then** they do not contradict the repository's current phase or approved roadmap boundary.

### Edge Cases

- A historical plan contains commands or examples using the former package name. It may remain unchanged when clearly historical, but it must not be treated as current setup guidance.
- A tracked text file contains a NUL or another byte pattern that makes a normal text search classify it as binary. Namespace-integrity validation must still inspect active tracked source reliably.
- A test creates temporary repositories or artifacts. Cleanup must run on both success and failure, and the verification must not depend on a previously populated temporary directory.
- A benchmark report already exists from an earlier successful run. Validation must execute the benchmark pipeline rather than treating the presence of that artifact as proof.
- An optional live GitHub smoke test cannot run without credentials. Required release integrity remains green or red based on deterministic local/fake-backed checks; the skipped live check must be reported honestly.
- Documentation and task checklists disagree with code. Reconciliation must use source, tests, and commit evidence; boxes must not be marked complete merely to make the documents appear current.

## Requirements

### Functional Requirements

- **FR-001**: All active workspace package imports and package identities MUST use the `@aker-build/*` namespace.
- **FR-002**: Active runtime artifact paths, temporary identifiers, test identities, and current user-facing product names MUST use Aker Build naming unless a documented compatibility requirement explicitly preserves a legacy identifier.
- **FR-003**: The workspace test suite MUST complete successfully from a clean checkout with locked dependencies.
- **FR-004**: Workspace type-checking MUST complete successfully from the same checkout.
- **FR-005**: The benchmark regression command MUST execute successfully against the complete committed corpus and enforce every committed threshold.
- **FR-006**: The documented first-run smoke path MUST complete successfully and prove the existing CLI chain without modifying tracked source.
- **FR-007**: Pull-request CI MUST explicitly run workspace tests, workspace type-checking, the benchmark regression gate, and first-run smoke validation, with failures reported as failures.
- **FR-008**: Automated namespace-integrity validation MUST detect unapproved legacy identifiers in active executable code, tests, manifests, workflows, runtime identifiers, and current user-facing documentation, and MUST report exact offending paths.
- **FR-009**: Namespace-integrity exclusions MUST be narrow, reviewable, and limited to documented historical records or compatibility fixtures; generated dependencies and Git internals may be excluded.
- **FR-010**: The root README and active contributor guidance MUST accurately state the current CLI installation method, benchmark reproducibility status, GitHub App/server availability, and deferred product surfaces.
- **FR-011**: The GitHub App package/server documentation and specs 014/015 delivery records MUST be reconciled with implemented source, tests, and remaining operator-owned steps.
- **FR-012**: Benchmark and detector claims MUST remain bounded to measured gates, confidence tiers, cases, and documented framework limitations.
- **FR-013**: The feature MUST NOT change public JSON schemas, confidence semantics, finding judgment, queue scoring, prompt safety rules, review verdicts, or GitHub write permissions.
- **FR-014**: The feature MUST NOT add runtime dependencies or require a lockfile change.
- **FR-015**: Required verification MUST NOT require production credentials, print secret values, persist checked-out source after a run, or introduce repository mutation.
- **FR-016**: Verification commands and their supported environment assumptions MUST be documented in one current contributor-facing location and referenced rather than inconsistently duplicated.

### Key Entities

- **Release-integrity gate**: The deterministic set of commands whose combined success establishes that the repository is testable, type-safe, benchmark-reproducible, and usable through its documented first-run path.
- **Active surface**: Executable code, tests, manifests, workflows, runtime/generated identifiers, and current user-facing documentation that represents the product today.
- **Historical exclusion**: A narrowly identified record allowed to retain a former product name because rewriting it would falsify history; it is not executable or current guidance.
- **Capability claim**: A user-facing statement about an implemented command, integration, benchmark result, limitation, or deployment boundary that must be backed by current repository evidence.

## Success Criteria

### Measurable Outcomes

- **SC-001**: From a clean checkout, `pnpm test` and `pnpm typecheck` both exit successfully with all workspace packages included.
- **SC-002**: The benchmark command processes all committed benchmark cases, meets all committed thresholds, and reproduces the scorecard claimed by current documentation.
- **SC-003**: The documented first-run smoke validation exits successfully and produces project map, risks, queue, route, prompt, review, and report artifacts.
- **SC-004**: CI runs all four release-integrity dimensions—tests, type-checking, benchmark, and first-run smoke—and a controlled failure in any one produces a failed CI result.
- **SC-005**: Automated validation reports zero unapproved legacy identifiers across active surfaces; every retained occurrence is covered by a narrow historical/compatibility rationale.
- **SC-006**: A documentation audit finds zero contradictory active status claims across the root README, contributor guidance, roadmap/status pointer, GitHub App READMEs, and specs 014/015.
- **SC-007**: All pre-existing behavior tests outside legacy-name expectations pass unchanged, and every public JSON schema version and verdict rule remains unchanged.
- **SC-008**: The final diff contains no dependency or lockfile changes and no new product capability beyond release-integrity validation and documentation reconciliation.

## Assumptions

- Node.js 22.13 or newer and pnpm 11 are the supported repository-development baseline.
- The existing 15-case synthetic benchmark corpus is the current evidence base; expanding framework coverage belongs to a later detector-focused spec.
- The current PowerShell first-run smoke is valid evidence for this repair slice. Cross-platform activation ergonomics will be addressed with the one-command/public-distribution work in spec 017.
- Existing fake-backed and local GitHub App tests are sufficient for required CI; credentialed live smoke remains opt-in and operator-owned.
- Historical design documents may preserve the previous project name when clearly identified as historical, but current instructions and executable examples may not.
- The exact active-surface inclusion list and narrow historical exclusions will be pinned by automated tests during planning; no exclusion may cover an entire current source, test, workflow, package, or documentation tree.

## Out of Scope

- Publishing an npm package or creating a release workflow.
- Adding `aker-build check`, `aker-build init`, `aker-build doctor`, or any other CLI command.
- Adding framework signature packs, detector logic, gates, benchmark scenarios, or coverage-honesty fields.
- Adding a container image, hosted deployment, dashboard, org aggregation, blocking enforcement, agent execution, auto-fix, commit, push, or merge behavior.
- Rewriting historical design records solely to remove the former product name.
- Changing dependencies, the lockfile, public schemas, or output-version contracts.
