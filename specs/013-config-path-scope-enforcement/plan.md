# Implementation Plan: 013 Config Path Scope Enforcement

Status: In Progress
Feature: `013-config-path-scope-enforcement`
Date: 2026-06-19

## Technical summary

Add reusable path-filter helpers to `@tenantguard/config` and apply them at read boundaries:

```text
config paths -> scanner file list -> project map/secret notes
config paths -> gates context file list -> risks
config paths -> review changed files -> attribution/scope
queue consumes already-filtered upstream artifacts
```

## Scope

Allowed files:

```text
packages/config/**
packages/scanner/**
packages/gates/**
packages/review/**
packages/cli/** only for --config scan/review plumbing if needed
specs/013-config-path-scope-enforcement/**
CLAUDE.md active feature pointer only
pnpm-lock.yaml only for dependency updates
```

Forbidden files:

```text
Hosted dashboard
GitHub App
OPA/Rego engine
Remote policy registry
Auto-fix / auto-commit / auto-merge
Broad gate rewrites
Public schema version changes
```

## Validation

Required:

```bash
pnpm --filter @tenantguard/config test
pnpm --filter @tenantguard/scanner test
pnpm --filter @tenantguard/gates test
pnpm --filter @tenantguard/review test
pnpm test
pnpm typecheck
```

Focused scenarios:

```text
include only apps/api/** excludes web-only scanner signals
exclude apps/api/routes/admin.ts prevents TG-G4 findings for that file
review ignores excluded changed files for attribution and scope
no config preserves existing behavior
explicit missing --config remains bad input where supported
```

## Stop conditions

Stop and report if:

- Enforcing paths requires changing existing artifact schemas.
- Review path filtering would make changed files disappear without any report context.
- Scanner/gates need broad rewrites instead of boundary-level filtering.
