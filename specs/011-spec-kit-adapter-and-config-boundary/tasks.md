---
description: "Task list for 011-spec-kit-adapter-and-config-boundary"
---

# Tasks: Spec Kit Adapter and Config Boundary

**Input**: `spec.md`, `plan.md`, ADR-011, current package boundaries.
**Prerequisites**: Synced `main`, branch `011-spec-kit-adapter-and-config-boundary`, maintainer approval to continue after 010.

**Scope**: Implement the first usable 011 slice:

- versioned local TenantGuard config schema/reader,
- visible gate suppressions,
- read-only Spec Kit artifact adapter,
- queue/prompt context enrichment through Spec Kit evidence,
- CLI `--config` plumbing for gates,
- tests first, then implementation.

**Allowed files**:

```text
contracts/tenantguard-config.schema.json
packages/config/**
packages/spec-kit-adapter/**
packages/gates/**
packages/queue/**
packages/review/** only for accepting/preserving suppression metadata in schemas
packages/cli/**
specs/011-spec-kit-adapter-and-config-boundary/**
docs/decisions/ADR-011-config-and-spec-adapter-boundary.md
CLAUDE.md active feature pointer only
pnpm-lock.yaml only for new workspace package manifests
```

**Forbidden files**:

```text
Hosted dashboard
GitHub App
Auto-fix / auto-commit / auto-merge
Remote policy registry
OPA/Rego engine
Secrets/env files
Broad rewrites unrelated to config/spec adapter
```

## Phase 1: Source Truth

- [X] T001 Verify repo state and branch before edits; stop on unrelated uncommitted changes.
- [X] T002 Read source truth: 011 spec/plan, ADR-011, current package schemas, gates, queue, prompt, review, CLI.
- [X] T003 Confirm this task file approves only the bounded 011 implementation areas above.

## Phase 2: Tests First

- [X] T004 Add failing tests for config schema accepting valid JSON/YAML.
- [X] T005 Add failing tests for config rejecting silent suppressions and secret-like values without leaking values.
- [X] T006 Add failing tests for Spec Kit adapter missing-artifact tolerance and artifact evidence extraction.
- [X] T007 Add failing tests for gates applying visible suppressions without hiding findings.
- [X] T008 Add failing tests for queue/prompt context enrichment from Spec Kit evidence.
- [X] T009 Add failing CLI tests for `tenantguard gates --config <path>`.

## Phase 3: Config Package

- [X] T010 Add `@tenantguard/config` with Zod schema, JSON/YAML reader, default discovery, explicit config path support, and sanitized errors.
- [X] T011 Add `contracts/tenantguard-config.schema.json` matching the implemented config surface.

## Phase 4: Spec Kit Adapter

- [X] T012 Add `@tenantguard/spec-kit-adapter` that reads `.specify/memory/constitution.md`, `spec.md`, `plan.md`, `tasks.md`, and checklists when present.
- [X] T013 Ensure missing Spec Kit artifacts are non-fatal and secret-like content is flagged without copying values.

## Phase 5: Integration

- [X] T014 Integrate config suppressions into `@tenantguard/gates` as visible `suppression` metadata.
- [X] T015 Preserve/accept suppression metadata in downstream schemas that consume gate findings.
- [X] T016 Enrich derived queue item evidence with Spec Kit artifact evidence when present, so generated prompts cite the relevant spec files.
- [X] T017 Add CLI `--config <path>` support to `tenantguard gates`.
- [X] T018 Update `CLAUDE.md` active feature pointer to 011.

## Phase 6: Validation

- [X] T019 Run focused tests for config, spec adapter, gates, queue, prompt, and CLI.
- [X] T020 Run `pnpm test` and `pnpm typecheck`.
- [X] T021 Run stale-reference/secret scans for new config/spec fixtures.
- [X] T022 Final status check confirms no forbidden surfaces, secrets, or unrelated files changed.
