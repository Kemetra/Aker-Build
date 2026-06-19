# Feature Specification: Spec Kit Adapter and Config Boundary

Status: Implemented in branch `011-spec-kit-adapter-and-config-boundary`
Feature: `011-spec-kit-adapter-and-config-boundary`
Date: 2026-06-19
Type: Product capability / adapter / config model

## Purpose

TenantGuard must read Spec Kit artifacts when present, but must not require users to adopt Spec Kit.

This feature defines a read-only Spec Kit adapter and a safe local config model for real repos.

## User stories

### US1: Repo with Spec Kit gets richer TenantGuard context

A team using `.specify/` runs TenantGuard and receives queue/prompt context informed by constitution, spec, plan, tasks, and checklists.

Acceptance:

- TenantGuard detects Spec Kit artifacts.
- Findings cite the relevant files.
- Prompt context includes allowed files, forbidden files, validation, and stop conditions when extractable.
- TenantGuard does not mutate Spec Kit files.

### US2: Repo without Spec Kit still works

A team with plain docs or no specs runs TenantGuard and receives useful project map, risks, queue, and prompt output.

Acceptance:

- Missing Spec Kit artifacts are not fatal.
- Output marks missing specs as `needs verification` only where relevant.
- Core scan/gates/queue/route still run.

### US3: Maintainer can tune gates safely

A maintainer adds a local config to define paths, severities, and explicit suppressions.

Acceptance:

- Config validates with helpful errors.
- Suppressions require reason and owner.
- Suppressed findings appear in reports; they are not hidden.

## Functional requirements

- FR-001: Support `tenantguard.config.json` and `tenantguard.config.yaml`.
- FR-002: Define a config schema with version, project metadata, include/exclude paths, gate settings, and suppressions.
- FR-003: Suppressions MUST include reason, owner, and path or finding id; expiry is recommended.
- FR-004: Suppressed findings MUST remain visible in output as suppressed.
- FR-005: Read `.specify/memory/constitution.md` when present.
- FR-006: Read `spec.md`, `plan.md`, `tasks.md`, and checklists when present.
- FR-007: Convert Spec Kit evidence into prompt/queue context without requiring Spec Kit.
- FR-008: Do not mutate specs, config, GitHub, or repo files.
- FR-009: Do not add OPA/Rego or plugin marketplace in this slice.
- FR-010: Do not leak secret-like content from specs or config into reports/prompts.

## Required outputs

```text
docs/decisions/ADR-011-config-and-spec-adapter-boundary.md
specs/011-spec-kit-adapter-and-config-boundary/spec.md
specs/011-spec-kit-adapter-and-config-boundary/plan.md
contracts/tenantguard-config.schema.json, if implementation tasks approve
packages/spec-kit-adapter/**, if implementation tasks approve
config reader in core/cli, if implementation tasks approve
```

## Non-goals

```text
No Spec Kit dependency requirement for users.
No mutation of Spec Kit artifacts.
No auto-generation of specs.
No OPA/Rego policy engine.
No remote policy registry.
No plugin marketplace.
No hosted dashboard.
No GitHub App.
```

## Success criteria

- SC-001: A Spec Kit repo produces richer queue/prompt context with file evidence.
- SC-002: A non-Spec-Kit repo still runs successfully.
- SC-003: Config suppressions are visible, auditable, and never silent.
- SC-004: No secret-like content is printed from config/spec artifacts.
- SC-005: All new config output is covered by schema and tests.
