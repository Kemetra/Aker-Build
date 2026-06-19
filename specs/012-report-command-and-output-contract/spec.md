# Feature Specification: Report Command and Output Contract

Status: Implemented in branch `012-report-command-and-output-contract`
Feature: `012-report-command-and-output-contract`
Date: 2026-06-19
Type: Product capability / output contract / CLI report

## Purpose

TenantGuard should produce one human-readable and machine-readable report that summarizes the current run artifacts.

This feature closes the MVP output gap by adding `tenantguard report` over existing outputs without changing scanner, gates, queue, route, prompt, or review behavior.

## User stories

### US1: User can read one final TenantGuard report

A developer runs the MVP chain and then runs `tenantguard report` to see project, risk, queue, route, review, suppression, config, and Spec Kit context in one place.

Acceptance:

- Report reads existing `.tenantguard` artifacts.
- Report writes `tenantguard-report.json` and `tenantguard-report.md`.
- Markdown names missing optional artifacts instead of crashing.
- JSON validates against a versioned schema.

### US2: Maintainer can consume stable report JSON

A maintainer or CI job can consume `tenantguard-report.json` without parsing Markdown.

Acceptance:

- JSON has `schema_version: 1`.
- JSON includes artifact presence, summary counts, suppressions, config metadata, and Spec Kit metadata.
- Secret-like content is never copied into JSON or Markdown.

## Functional requirements

- FR-001: Add `tenantguard report [path] [--out <dir>] [--stdout] [--format json|yaml|md]`.
- FR-002: Add a versioned `tenantguard-report.json` contract and `contracts/report.schema.json`.
- FR-003: Read `project-map.json`, `risks.json`, `queue.json`, `route.json`, and optional `review.json` from the output directory.
- FR-004: Missing artifacts must be visible in the report and non-fatal.
- FR-005: Suppressed findings must remain visible in report output.
- FR-006: Include auto-discovered config path and config summary when present.
- FR-007: Include Spec Kit artifact presence/counts without copying raw Spec Kit content.
- FR-008: Validate generated report JSON before writing.
- FR-009: Do not add hosted dashboard, GitHub App, auto-fix, auto-commit, or auto-merge behavior.

## Success criteria

- SC-001: Full MVP chain plus report produces valid JSON and Markdown.
- SC-002: Partial artifact sets produce useful missing-artifact output.
- SC-003: Suppressions are visible and auditable.
- SC-004: Report output is deterministic except for filesystem paths already present in source artifacts.
- SC-005: `pnpm test` and `pnpm typecheck` pass.
