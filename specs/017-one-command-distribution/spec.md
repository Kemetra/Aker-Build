# Feature Specification: One-Command Activation and Distribution

**Feature Branch**: `017-one-command-distribution`
**Created**: 2026-07-20
**Status**: Implemented — release-ready; first npm publish remains operator-owned (verified 2026-07-20)
**Input**: User direction: continue with the recommended improvement after release integrity, choose recommended defaults, and prioritize a polished public activation path.

## Clarifications

### Session 2026-07-20

- Q: Does “one-command activation” mean packaging the existing commands or adding an end-to-end command? → A: Both. The public path is `npx aker-build check .`; `check` composes the existing read-only scan, gates, queue, route, and report stages.
- Q: Should `check` generate an agent prompt or review a diff? → A: No. Prompt generation requires an explicit queue item, and review requires diff/PR context. Both remain separate, intentional commands.
- Q: Should the CLI publish as one package or as the complete internal workspace graph? → A: Publish one bundled `aker-build` package with no `workspace:*` runtime dependencies.
- Q: Should implementation publish the package to npm? → A: No. It produces and verifies the exact release artifact and release workflow. The first public registry write remains an explicit operator action.
- Q: How is supply-chain authentication handled after the first release? → A: Use npm trusted publishing through a manually triggered, approval-protected GitHub Actions workflow. Do not store a long-lived publish token in the repository.
- Q: What if the unscoped npm name becomes unavailable before release? → A: Stop before changing package identity. The owner must explicitly approve the scoped fallback `@aker-build/cli`; the executable name remains `aker-build` either way.

## User Scenarios & Testing

### User Story 1 - Run the useful Aker Build path with one command (Priority: P1)

A developer in a Git repository runs one command and receives the complete advisory artifact chain without cloning Aker Build or understanding its internal package layout.

**Why this priority**: The current source-first sequence proves capability but imposes seven commands and repository-specific tooling. A public CLI is only useful when activation is simpler than the problem it evaluates.

**Independent Test**: In a clean fixture repository, run `aker-build check .`; verify project map, risks, queue, route, and JSON/Markdown report artifacts are produced and the source repository remains unchanged.

**Acceptance Scenarios**:

1. **Given** a valid Git repository, **When** the user runs `aker-build check .`, **Then** scan, gates, queue, route, and report execute in that order and complete with a concise summary.
2. **Given** a custom output directory and config path, **When** the user passes them to `check`, **Then** every stage uses the same resolved paths.
3. **Given** a stage cannot complete, **When** `check` exits, **Then** it identifies the failed stage, returns a documented non-zero exit code, removes its temporary work, and does not promote a partial new artifact set.
4. **Given** an existing successful artifact set, **When** a later `check` attempt fails, **Then** the prior complete set is not silently mixed with partial new artifacts.
5. **Given** the source repository before and after `check`, **When** tracked and untracked source is compared outside the explicit output directory, **Then** it is unchanged.

---

### User Story 2 - Install and run the exact release artifact (Priority: P1)

A user with supported Node.js can install or execute Aker Build from one npm package. They do not need pnpm, TypeScript, `tsx`, the monorepo, or separately published internal packages.

**Why this priority**: A `check` command that only works inside the source repository is not public activation. Packaging and activation must be proven together against the artifact that would be published.

**Independent Test**: Build and pack the CLI, install the resulting tarball into a clean temporary project on Linux and Windows, run `aker-build --help`, then run `aker-build check` against the committed example repository.

**Acceptance Scenarios**:

1. **Given** the packed tarball, **When** it is inspected, **Then** it contains the executable bundle and required package documentation but excludes source tests, fixtures, private workspace metadata, and unrelated packages.
2. **Given** a clean supported Node.js environment, **When** the tarball is installed, **Then** npm links an `aker-build` executable that runs without TypeScript loaders or monorepo resolution.
3. **Given** the installed tarball, **When** `aker-build check` runs against the example repository, **Then** it produces the same contract-versioned artifacts and advisory results as the source-first CLI.
4. **Given** the package manifest, **When** its production dependencies and lifecycle scripts are inspected, **Then** no `workspace:*` dependency or install-time script exists.
5. **Given** existing standalone commands, **When** they are invoked through the packed executable, **Then** their command shapes and exit semantics remain compatible.

---

### User Story 3 - Prepare a deliberate, auditable npm release (Priority: P2)

A maintainer can produce and publish a verified package through an explicit release action without turning every merge into a deployment and without storing a reusable npm publish token.

**Why this priority**: Distribution adds a supply-chain boundary. The project must make the safe path the documented path before the first public release, even though the owner performs the registry bootstrap.

**Independent Test**: Validate the release workflow structure and execute every pre-publish command locally; verify publication is manual/approval-gated, consumes the already-tested package artifact, and requires OIDC trusted publishing rather than a repository token.

**Acceptance Scenarios**:

1. **Given** an ordinary push or pull request, **When** CI runs, **Then** it verifies the distributable artifact but never publishes it.
2. **Given** a maintainer explicitly starts a release, **When** the workflow reaches publication, **Then** GitHub environment approval and all release-integrity/package checks are required first.
3. **Given** a configured npm trusted publisher, **When** the approved workflow publishes, **Then** it uses short-lived OIDC identity and npm provenance rather than a long-lived npm token.
4. **Given** the package does not yet exist in npm, **When** the owner follows the bootstrap checklist, **Then** the first `0.1.0` publish is identified as an operator-owned external step before trusted publishing is configured.
5. **Given** a version/tag/name mismatch or an unavailable package name, **When** release preflight runs, **Then** publication stops with a specific diagnostic and performs no registry write.

## Edge Cases

- The target path is not a Git repository: fail in the scan stage with no promoted partial output.
- The output directory is inside the scanned repository: exclude it from evidence exactly as existing commands do and never scan temporary check artifacts.
- The output directory already contains prompt/review artifacts: replace only the artifact set owned by `check`; do not delete unrelated explicit outputs.
- A process is interrupted mid-run: best-effort temporary cleanup occurs on the next run; incomplete staging directories are never treated as successful output.
- Windows executable linking and path separators differ from Linux: tarball acceptance runs on both operating systems.
- The tarball is installed without network access to the Aker Build monorepo: execution still succeeds because internal packages are bundled.
- The npm registry name changes between planning and release: release preflight fails rather than silently switching identities.
- The GitHub workflow lacks OIDC/environment configuration: publishing fails closed and docs identify the operator setup step.
- Findings are present: `check` reports them but does not become an enforcing/blocking command; successful analysis is distinct from a clean risk report.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The CLI MUST add `check [path]` as the canonical one-command advisory path.
- **FR-002**: `check` MUST execute scan → gates → queue → route → report in that exact order using the existing domain implementations rather than spawning nested CLI processes.
- **FR-003**: `check` MUST accept a shared output directory and optional config path and MUST resolve them once for all applicable stages.
- **FR-004**: `check` MUST stage its owned artifact set separately and promote it only after every required stage succeeds.
- **FR-005**: On failure, `check` MUST name the failed stage, return a documented non-zero exit code, clean its staging work, and MUST NOT print a success summary.
- **FR-006**: `check` MUST remain read-only on analyzed source and MUST NOT execute agents, generate fixes, commit, push, open pull requests, or merge.
- **FR-007**: `check` MUST NOT implicitly generate a prompt or perform a PR/local-diff review.
- **FR-008**: Existing standalone command names, options, artifact schemas, finding logic, verdict logic, and exit semantics MUST remain compatible.
- **FR-009**: The distributable package MUST be named `aker-build` at version `0.1.0` and MUST expose a bin named `aker-build`, unless the owner explicitly approves a package-name fallback after a failed availability preflight.
- **FR-010**: The package bin MUST target built JavaScript under `dist/`; users MUST NOT require TypeScript, `tsx`, pnpm, or repository source.
- **FR-011**: The published package MUST be a single installable unit with zero production dependencies; internal workspace code and the required Commander, YAML, and Zod runtime code MUST be included in the built artifact.
- **FR-012**: The package MUST declare Node.js 22.13 or newer, MIT license, repository/homepage/bugs metadata, useful keywords, a minimal `files` allowlist, and public npm publish configuration.
- **FR-013**: The package MUST contain no install, preinstall, or postinstall lifecycle script. Installation and the `check` activation path MUST perform no network request after npm has obtained the package; the existing explicit GitHub PR review path remains unchanged.
- **FR-014**: Repository verification MUST build and inspect the exact `npm pack` tarball, install it in clean temporary environments, and run acceptance checks on both Linux and Windows.
- **FR-015**: Tarball verification MUST reject source tests/fixtures, runtime dependencies, workspace protocol references, missing executable shebang, missing required metadata, and any file outside the explicit package allowlist.
- **FR-016**: Pull-request CI MUST verify package build, pack contents, clean installation, `--help`, and the one-command example path, but MUST NEVER publish.
- **FR-017**: The release workflow MUST be maintainer-triggered, protected by a GitHub environment approval, repeat the release-integrity/package gates, and fail on package-name, version, or release-ref mismatch before publication.
- **FR-018**: Post-bootstrap publication MUST use npm trusted publishing through GitHub Actions OIDC and MUST NOT require a long-lived npm publish token in repository secrets.
- **FR-019**: The first registry publication and npm trusted-publisher configuration MUST remain documented operator actions; implementation and automated acceptance MUST perform zero public registry writes.
- **FR-020**: The package MUST include the project license and auditable third-party license notices for bundled Commander, YAML, and Zod code.
- **FR-021**: The feature MUST NOT change public JSON schemas, contract versions, detector coverage, gate decisions, GitHub App behavior, or enforcement posture.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a clean supported environment, one installed command produces project map, risks, queue, route, and JSON/Markdown report artifacts for the example repository.
- **SC-002**: The packed CLI passes the complete activation acceptance test on current GitHub-hosted Ubuntu and Windows runners.
- **SC-003**: The tarball contains zero test/fixture files, zero production dependencies, zero `workspace:*` references, zero install hooks, and no undeclared file outside the package allowlist.
- **SC-004**: A controlled failure at each composed stage produces no newly promoted partial artifact set and leaves no active staging directory.
- **SC-005**: Source-first and packed executions produce schema-valid artifacts with equivalent findings, queue selection, route selection, and report totals for the same fixture.
- **SC-006**: All existing workspace tests, complete type-checking, namespace integrity, benchmark thresholds, and first-run smoke remain green.
- **SC-007**: Ordinary CI paths contain zero npm publication command executions; only the approval-protected manual release job can reach publication.
- **SC-008**: Repository history/configuration contains zero long-lived npm publish token values, and workflow publication is configured for OIDC trusted publishing.
- **SC-009**: The documented release preflight detects an unavailable package name or a version/ref mismatch before any registry mutation.
- **SC-010**: Automated implementation verification performs zero public npm registry writes; the operator checklist explicitly owns the first publish and trust bootstrap.
- **SC-011**: The tarball contains the MIT project license and complete notices for every bundled third-party runtime dependency.

## Assumptions

- The official npm registry returned HTTP 404 for `aker-build` on 2026-07-20; this is availability evidence, not a reservation.
- Node.js 22.13+ remains the supported runtime baseline from the repository root.
- The existing CLI packages are bundle-compatible because runtime file reads target user repositories/artifact paths rather than package-owned source assets.
- `0.1.0` is the first public version chosen by ADR-010.
- npm trusted publishing requires the package to exist before its trust relationship can be configured, so bootstrap cannot be fully automated without an initial external owner action.
- GitHub-hosted runners and an owner-configured protected release environment are available for post-bootstrap publishing.
- Spec 016 is a hard dependency: its namespace, deterministic tests, CI gates, and source-truth fixes must be integrated before 017 implementation is merged or released.

## Out of Scope

- Performing the first or any subsequent real npm publication during implementation.
- Reserving npm names, creating npm accounts/organizations, configuring npm 2FA, or configuring GitHub environments on the owner's behalf.
- Adding `init`, `doctor`, interactive setup, global-install-only behavior, Homebrew, Docker, or standalone native binaries.
- Including prompt generation or PR/local-diff review inside `check`.
- Publishing internal `@aker-build/*` workspace packages independently.
- Changing artifact schemas, detector coverage, confidence calibration, gate semantics, advisory verdicts, or benchmark corpus claims.
- Packaging or hosting the GitHub App server, adding a dashboard/org view, enabling blocking enforcement, or adding mutation/agent execution.

## External References

- npm package manifest/bin rules: https://docs.npmjs.com/files/package.json/
- npm trusted publishing and automatic provenance: https://docs.npmjs.com/trusted-publishers/
- GitHub Actions package publishing guidance: https://docs.github.com/en/actions/tutorials/publish-packages
