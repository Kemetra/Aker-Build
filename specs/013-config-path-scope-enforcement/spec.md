# Feature Specification: Config Path Scope Enforcement

Status: In Progress
Feature: `013-config-path-scope-enforcement`
Date: 2026-06-19
Type: Product capability / config enforcement

## Purpose

TenantGuard config `paths.include` and `paths.exclude` must affect the files TenantGuard scans, gates, queues, and reviews.

This feature makes the 011 config boundary operational without adding a remote policy system or changing gate rules.

## Functional requirements

- FR-001: Apply `paths.include` and `paths.exclude` to scanner file discovery.
- FR-002: Apply the same path filter to gate file discovery and findings.
- FR-003: Queue derivation must consume the already-filtered risks and project map without reintroducing excluded findings.
- FR-004: Review changed-file attribution must ignore excluded changed files.
- FR-005: Include/exclude matching supports exact paths, `*`, `**`, and `dir/**`.
- FR-006: Missing config remains non-fatal unless an explicit config path is provided.
- FR-007: Excluded files must not create new findings, queue items, or review-attributable findings.
- FR-008: Do not hide configured suppressions silently; reporting remains responsible for showing configured filters and suppressions.

## Non-goals

```text
No hosted dashboard.
No GitHub App.
No OPA/Rego engine.
No remote policy registry.
No broad gate rewrites.
No changes to public output schema versions.
```

## Success criteria

- SC-001: Scanner ignores excluded files.
- SC-002: Gates do not emit findings for excluded files.
- SC-003: Review does not attribute excluded changed files.
- SC-004: Existing behavior remains unchanged when no config is present.
- SC-005: `pnpm test` and `pnpm typecheck` pass.
