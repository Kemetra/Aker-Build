# Implementation Plan: 012 Report Command and Output Contract

Status: Implemented in branch `012-report-command-and-output-contract`
Feature: `012-report-command-and-output-contract`
Date: 2026-06-19

## Technical summary

Add `@tenantguard/report` and wire `tenantguard report` so users can summarize the current `.tenantguard` artifact set as validated JSON and Markdown.

## Package boundary

```text
packages/report
  read existing TenantGuard artifacts
  validate and summarize report JSON
  render deterministic Markdown

packages/cli
  expose report command and exit-code mapping
```

## Scope

Allowed files:

```text
contracts/report.schema.json
packages/report/**
packages/cli/**
packages/config/** only if required for exported types/errors
packages/spec-kit-adapter/** only if required for exported types
specs/012-report-command-and-output-contract/**
CLAUDE.md active feature pointer only
pnpm-lock.yaml only for new workspace package manifest
README.md and packages/cli/README.md command docs
scripts/smoke-first-run.ps1 only to append report step
```

Forbidden files:

```text
Hosted dashboard
GitHub App
Auto-fix / auto-commit / auto-merge
Remote policy registry
OPA/Rego engine
Secrets/env files
Broad rewrites unrelated to report output
```

## Validation

Required:

```bash
pnpm --filter @tenantguard/report test
pnpm --filter @tenantguard/cli test
pnpm test
pnpm typecheck
```

Focused scenarios:

```text
full artifact set produces valid report JSON and Markdown
missing optional artifacts are listed as missing and do not fail
suppressed findings remain visible
secret-like values are not copied
CLI stdout supports json/yaml/md
```

## Stop conditions

Stop and report if:

- Reporting requires changing existing artifact schemas without ADR approval.
- Report generation would copy raw secret-like content from config/spec files.
- Implementation requires hosted/GitHub App functionality.
