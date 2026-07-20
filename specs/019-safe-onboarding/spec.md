# Feature Specification: Safe Repository Onboarding

**Feature Branch**: `019-safe-onboarding`
**Created**: 2026-07-20
**Status**: Approved for implementation
**Input**: Close the declared MVP onboarding gap with deterministic `init` and read-only `doctor` commands.

## Purpose

A first-time user can run the analysis chain, but the CLI does not implement the
`aker-build init` command named in the product contract and offers no single
preflight explaining whether a repository is ready. This feature adds a narrow,
safe onboarding surface without weakening Aker Build's no-hidden-mutation rule.

## Clarifications

### Session 2026-07-20

- **Recommended scope selected**: ship `init` and `doctor` together. `init` makes
  the one intentional repository write; `doctor` verifies the same prerequisites
  without writing. Reusable GitHub Action packaging follows after this missing
  MVP surface is closed.
- `init` requires an existing Git repository. It never runs `git init`, installs
  dependencies, scans source, or creates analysis artifacts.
- `init` defaults to `aker-build.config.yaml`, supports `--format yaml|json`, and
  supports `--stdout` as a no-write preview suitable for redirection.
- One valid recognized config means the repository is already initialized and
  is an idempotent success. An invalid/unreadable config or the simultaneous
  presence of both recognized formats is an error. `init` never overwrites
  either recognized config format and provides no force option.
- Generated configuration is intentionally behavior-neutral: schema version 1
  plus commented YAML examples where the format supports comments. It MUST load
  through the existing config validator without changing default analysis scope.
- `doctor` defaults to local readiness. `--github` adds GitHub PR-mode checks for
  the `gh` executable and the presence (never the value) of an accepted CI token
  environment variable.
- `doctor --format text|json` provides human and automation output from one
  versioned result model. Checks have deterministic identifiers and order.
- A missing config is a warning, not a local-readiness failure, because Aker
  Build already supports zero-config operation. Invalid config, missing Git,
  non-Git input, or an unsupported Node runtime are failures. A tracked/default
  output directory is a warning with remediation, not silent mutation.

## User Scenarios & Testing

### User Story 1 - Initialize safely (Priority: P1)

A maintainer initializes an existing Git repository and gets a minimal valid
config without any unrelated file change.

**Independent Test**: Run `aker-build init <fixture>` in a temporary Git
repository, validate the generated config with `loadConfig`, rerun the command,
and compare a before/after filesystem snapshot.

**Acceptance Scenarios**:

1. **Given** an unconfigured Git repository, **When** `init` runs, **Then** it
   creates exactly one behavior-neutral config and reports its path.
2. **Given** the generated config already exists and is valid, **When** `init`
   runs again, **Then** it exits successfully and changes no file.
3. **Given** either recognized config exists but is invalid, **When** `init`
   runs, **Then** it fails with validation evidence and overwrites nothing.
4. **Given** `--stdout`, **When** `init` runs, **Then** it emits only valid
   starter config to stdout and performs zero writes.

### User Story 2 - Diagnose local readiness (Priority: P1)

A maintainer runs one read-only command and sees which prerequisite is ready,
which needs attention, and the exact safe remediation.

**Independent Test**: Run `doctor` against ready, non-Git, missing-config,
invalid-config, and unignored-output fixtures using controlled command probes;
assert the versioned result and that the repository snapshot is unchanged.

**Acceptance Scenarios**:

1. **Given** a compatible runtime and valid Git repository, **When** `doctor`
   runs, **Then** required local checks pass and the command exits 0.
2. **Given** no config, **When** `doctor` runs, **Then** zero-config readiness
   remains successful and the result recommends `aker-build init`.
3. **Given** an invalid config or non-Git path, **When** `doctor` runs, **Then**
   the result is `needs_attention`, identifies the failed check, and exits 1.
4. **Given** JSON output, **When** the same probes are used, **Then** JSON and
   text are projections of the same ordered diagnostic result.

### User Story 3 - Diagnose GitHub PR readiness (Priority: P2)

A maintainer preparing CI can extend the read-only diagnostic to the tools and
credential presence needed by `review-pr <number>`.

**Independent Test**: Inject present/missing `gh` probes and token-presence
states; assert `--github` adds only the documented checks and never captures or
prints a token value.

**Acceptance Scenarios**:

1. **Given** `--github`, **When** `gh` and an accepted token variable are
   available, **Then** GitHub readiness passes.
2. **Given** `--github` without `gh` or token presence, **When** `doctor` runs,
   **Then** the relevant check fails without printing secret material.
3. **Given** local mode, **When** `doctor` runs, **Then** GitHub-only checks are
   omitted and do not affect readiness.

## Functional Requirements

- **FR-001**: The CLI MUST expose `init [path]` and `doctor [path]` in help and
  in the self-contained npm artifact.
- **FR-002**: `init` MUST require an existing Git repository and MUST NOT invoke
  Git initialization, dependency installation, scanning, or any network call.
- **FR-003**: `init` MUST generate config accepted by the existing version-1
  schema and MUST preserve zero-config behavior unless the user edits examples.
- **FR-004**: `init` MUST default to YAML, support JSON, and make `--stdout`
  strictly no-write.
- **FR-005**: `init` MUST inspect both recognized config filenames and MUST
  never overwrite one. A valid existing config is success; an invalid existing
  config or two simultaneous recognized configs is a validation/conflict
  failure with no write.
- **FR-006**: A writing `init` run MUST create exactly one config file using an
  exclusive create operation so a concurrent writer cannot be overwritten.
- **FR-007**: `doctor` MUST be read-only and MUST report deterministic checks
  for Node compatibility, Git availability, Git-repository state, config state,
  and default output-directory ignore protection.
- **FR-008**: `doctor --github` MUST additionally check `gh` availability and
  accepted token-variable presence without reading, retaining, or printing a
  credential value.
- **FR-009**: Doctor results MUST use a versioned model with repository path,
  mode, overall status, and ordered checks containing id, status, summary, and
  optional remediation.
- **FR-010**: Text and JSON doctor renderers MUST consume the same result model.
- **FR-011**: Missing config and unignored output MUST be warnings; required
  prerequisite failures MUST produce `needs_attention` and exit code 1.
- **FR-012**: Invalid CLI input MUST use exit code 2. Internal failures MUST use
  exit code 3. Successful or warning-only results MUST use exit code 0.
- **FR-013**: Neither command may print secret-like config content or credential
  values. Existing secret-safe config errors may identify only the file path.
- **FR-014**: Neither command may modify `.gitignore`, source, specs, workflows,
  dependencies, lockfiles, Git state, or the `.aker-build` artifact directory.
- **FR-015**: Package acceptance MUST execute the bundled commands in temporary
  fixtures so source-only success cannot mask a broken published artifact.

## Diagnostic Result Contract

```text
version       1
repository    absolute normalized path
mode          local | github
status        ready | needs_attention
checks[]      id, status(pass|warn|fail), summary, remediation?

check order   node → git → repository → config → output-ignore
              → gh → github-token (last two only in github mode)
```

No check payload contains environment-variable values, config contents, source
snippets, or Git remote URLs.

## Non-Goals

```text
No interactive wizard.
No force/overwrite mode.
No automatic git init or .gitignore edits.
No source scan or generated .aker-build artifacts.
No framework-specific config inference.
No network or registry probe.
No workflow generation or GitHub mutation.
No dashboard, organization aggregation, or blocking policy.
No new dependency or lockfile change.
```

## Success Criteria

- **SC-001**: Fresh-repo initialization creates exactly one validator-accepted
  config and changes zero other files.
- **SC-002**: Re-running initialization over a valid config changes zero bytes
  and exits 0; invalid or conflicting config is never overwritten.
- **SC-003**: Preview mode performs zero writes and its output validates in both
  supported formats.
- **SC-004**: Doctor classifies every required fixture correctly and performs
  zero repository writes.
- **SC-005**: GitHub-mode tests prove no credential value appears in structured
  results, rendered output, or error text.
- **SC-006**: The built npm tarball passes init/doctor acceptance on Windows and
  Linux through the existing package-acceptance CI matrix.
- **SC-007**: Workspace tests, typecheck, namespace integrity, benchmark, CLI
  package acceptance, and first-run smoke remain green.

## Allowed Implementation Surface

```text
packages/config/src/index.ts
packages/config/tests/config.test.ts
packages/cli/src/index.ts
packages/cli/src/commands/init.ts
packages/cli/src/commands/doctor.ts
packages/cli/tests/cli.init.test.ts
packages/cli/tests/cli.doctor.test.ts
scripts/verify-cli-package.mjs
README.md
packages/cli/README.md
docs/demo/first-run.md
docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md
docs/status/post-foundation-reconciliation.md
CLAUDE.md
.specify/feature.json
specs/019-safe-onboarding/**
```

## Forbidden Surface

```text
pnpm-lock.yaml and every package manifest
.github/workflows/**
packages/github-app*/**
all gate, scanner, queue, router, prompt, review, and report behavior
public npm publication, Git tags, pushes, pull requests, or workflow dispatch
```

## Approval

The owner directed the session to choose and execute recommended actions without
stopping for routine clarifications. That standing instruction approves this
recommended design and its transition to detailed planning, while external
publication remains outside the authorization boundary.
