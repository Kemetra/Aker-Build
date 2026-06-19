# Implementation Plan: 011 Spec Kit Adapter and Config Boundary

Status: Draft
Feature: `011-spec-kit-adapter-and-config-boundary`
Date: 2026-06-19

## Technical summary

Add a safe configuration layer and read-only Spec Kit adapter so TenantGuard can use formal specs when present but remain useful without them.

## Architecture

```text
Repo files
  -> Config Reader
  -> Source Scanner
  -> Spec Kit Adapter, optional
  -> Project Map / Evidence Context
  -> Gates
  -> Queue
  -> Router
  -> Prompt Compiler
  -> Reports
```

## Data model draft

```yaml
version: 1
project:
  name: example-saas
  type: monorepo
paths:
  include:
    - apps/**
  exclude:
    - dist/**
    - coverage/**
gates:
  TG-G4:
    severity: high
    suppressions:
      - id: TG-G4-EXAMPLE-001
        path: apps/demo/**
        reason: Demo fixture intentionally violates auth guard rule.
        owner: maintainer
        expires: 2026-09-01
specs:
  adapter: auto
```

## Proposed package boundaries

```text
packages/config
  read and validate tenantguard config

packages/spec-kit-adapter
  read Spec Kit artifacts and normalize evidence

packages/core or existing packages
  consume config/spec context without depending on filesystem details
```

Exact package placement should be decided during tasks based on current workspace layout.

## Scope

Allowed areas, subject to tasks approval:

```text
contracts/tenantguard-config.schema.json
packages/config/**
packages/spec-kit-adapter/**
packages/project-map/** only for typed context integration
packages/gates/** only for config/suppression consumption
packages/queue/** only for spec-derived hints
packages/prompt/** only for spec-derived prompt context
packages/reporters/** only to show suppressions/spec evidence
packages/cli/** only to pass config path/options
specs/011-spec-kit-adapter-and-config-boundary/**
docs/decisions/ADR-011-config-and-spec-adapter-boundary.md
```

Forbidden areas:

```text
Hosted dashboard
GitHub App
Auto-fix / auto-commit / auto-merge
Remote policy registry
OPA/Rego engine
Secrets/env files
Broad rewrites unrelated to config/spec adapter
```

## Validation

Required:

```bash
pnpm test
pnpm typecheck
```

Suggested focused tests:

```text
config schema accepts valid JSON/YAML
config schema rejects silent suppressions
missing Spec Kit artifacts do not fail core scan
Spec Kit artifacts enrich context when present
secret-like strings in config/spec files are redacted or flagged, not printed
suppressed findings remain visible
```

## Risks

| Risk | Mitigation |
|---|---|
| Users silence all findings | Suppressions are visible, reasoned, owned, and preferably expiring. |
| Spec Kit becomes required accidentally | Missing artifacts must be non-fatal. |
| Prompts become too broad from spec parsing | Adapter should emit scoped hints, not unrestricted instructions. |
| Scope creep into plugin engine | Keep OPA/Rego/plugin registry deferred. |

## Stop conditions

Stop and report if:

- Config requires a breaking change to current output contracts without ADR approval.
- Spec Kit parsing requires mutating files.
- Secret-like values would appear in output.
- Implementation requires hosted/GitHub App functionality.
