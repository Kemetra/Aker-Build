# Release Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a reproducible green repository, prevent legacy-namespace regressions, and make active documentation match the implemented product.

**Architecture:** Repair the two observed verification failures at their narrow sources, then add a dependency-free repository namespace guard as a permanent release invariant. CI composes that guard with existing tests, type-checking, benchmark, and first-run smoke; documentation reconciliation consumes source/test/commit evidence without changing product behavior.

**Tech Stack:** TypeScript 5.7, Node.js 22.13+, pnpm 11, Vitest 2, Node built-in test runner, PowerShell 7, GitHub Actions.

## Global Constraints

- No production behavior change to detection, gates, queueing, prompts, review verdicts, webhook handling, or GitHub Checks permissions.
- No new runtime or development dependency and no `pnpm-lock.yaml` change.
- No public JSON schema/version or output-contract change.
- Required verification must run without production credentials or live network access.
- Historical records may retain the former name only through exact, documented file allowances.
- Do not commit, stage, push, or open a PR without explicit authorization; suggested commit boundaries in `tasks.md` are authorization-gated.
- Never use `git add .` or `git add -A` for repository staging.

---

## Summary

The current first-run workflow succeeds, but release verification is not reproducible: evaluation imports still use the former workspace namespace, and six real-git tests inherit global commit signing. This plan repairs those failures, completes active naming cleanup, adds an automated tracked-file namespace check, expands CI to the complete release-integrity gate, and reconciles documentation/spec status with shipped P4/P4-deployment evidence.

## Technical Context

**Language/Version**: TypeScript 5.7 and ECMAScript modules on Node.js >=22.13
**Primary Dependencies**: Existing workspace packages only; Node built-ins for the new guard
**Storage**: N/A; temporary fixture repositories and generated local artifacts only
**Testing**: Vitest, `node:test`, benchmark evaluator, PowerShell first-run smoke
**Target Platform**: Local Windows development plus GitHub-hosted Ubuntu and Windows runners
**Project Type**: TypeScript monorepo containing CLI, libraries, and a self-hostable GitHub App runtime
**Performance Goals**: Namespace validation scans only active tracked/untracked files and completes as part of normal PR CI
**Constraints**: Offline deterministic core verification; no secrets; no source persistence; no hidden mutation
**Scale/Scope**: 14 workspace projects, 15 benchmark cases, active docs/spec status through feature 016

## Constitution Check

| Principle / gate | Result | Evidence |
|---|---|---|
| I. Source Truth First | Pass | Failures reproduced from current source; 014/015 status uses code, tests, and commits. |
| II. CLI First | Pass | First-run CLI smoke becomes an explicit CI gate; no hosted prerequisite added. |
| III. Evidence-Based Findings | Pass | Namespace violations report exact path, line, and identifier. |
| IV. Spec-compatible | Pass | Canonical artifacts live under `specs/016-release-integrity/`; product behavior remains independent of Spec Kit. |
| V. Agent Safety | Pass | Prompt generation is unchanged. |
| VI. No Hidden Mutation | Pass | Validation is read-only except temporary fixtures and generated ignored benchmark output. |
| VII. No Secrets | Pass | Guard prints identifiers only; live credentials are not required; App secret behavior is unchanged. |
| VIII. General SaaS Kernel | Pass | No private domain or framework-specific logic added. |
| TG-G0 Source Truth | Pass | Branch/status and current failures captured before edits. |
| TG-G1 Boundary | Pass | Work is limited to verification, naming, CI, and active docs. |
| TG-G2 Contract | Pass | No public schema or verdict contract changes. |
| TG-G7 Observability | Pass | CI and guard failures are explicit and path-addressable. |
| TG-G8 Dependencies | Pass | Node built-ins only; lockfile forbidden. |
| TG-G9 Release Readiness | Pass when complete | Full gate is tests + typecheck + benchmark + smoke + namespace validation. |

## File Structure and Responsibilities

### New files

```text
scripts/
├── check-namespace.mjs          # CLI + pure functions for active-surface legacy-name detection
└── check-namespace.test.mjs     # node:test coverage for matching, allowlist, NUL, and active paths

specs/016-release-integrity/
├── spec.md                      # approved requirements
├── research.md                  # reproduced evidence and technical decisions
├── plan.md                      # architecture, boundaries, file map, requirement mapping
├── tasks.md                     # executable TDD task sequence
└── checklists/requirements.md   # specification quality gate
```

### Modified executable/test files

```text
package.json                                      # root namespace-test/check scripts
packages/eval/src/run-case.ts                     # Aker imports, temp/output identity, escaped separator
packages/github-app-server/tests/
├── git-workspace-real.test.ts                    # hermetic unsigned fixture commit
├── real-review.test.ts                           # hermetic unsigned fixture commits
└── live-smoke.test.ts                            # Aker Build smoke-target variable names
packages/**/tests/**/*.ts                         # mechanical tg-* → aker-build-* temp prefixes
packages/github-app-server/src/git-workspace.ts   # production temp prefix only; behavior unchanged
```

The exact mechanical rename list is pinned in `tasks.md` and by `check-namespace.mjs`; no detector or judgment source is included.

### Modified CI and active truth files

```text
.github/workflows/aker-build.yml
.specify/feature.json
README.md
CLAUDE.md
CONTRIBUTING.md
docs/status/post-foundation-reconciliation.md
docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md
packages/github-app-server/README.md
specs/014-github-app-report-only/spec.md
specs/014-github-app-report-only/tasks.md
specs/015-github-app-deployment/spec.md
specs/015-github-app-deployment/tasks.md
specs/015-github-app-deployment/live-smoke-checklist.md
```

## Interfaces

`scripts/check-namespace.mjs` exports:

```js
export function isActivePath(repoRelativePath) // string -> boolean
export function findLegacyReferences(entries, allowedPaths) // Array<{path,content}>, Set<string> -> findings
export function readCandidateEntries(repoRoot) // string -> Array<{path,content}>
```

Each finding has this stable internal shape:

```js
{ path: string, line: number, identifier: string }
```

CLI contract:

- exit `0`: `Namespace integrity passed (<n> active files scanned).`
- exit `1`: one ASCII line per finding: `<path>:<line>: legacy identifier <json-string>`.
- never prints the surrounding source line.

Root scripts:

```json
{
  "test": "pnpm test:namespace && pnpm -r test",
  "test:namespace": "node --test scripts/check-namespace.test.mjs",
  "check:namespace": "node scripts/check-namespace.mjs"
}
```

## Execution Order

1. Restore deterministic focused suites (evaluation imports/NUL separator and unsigned fixture commits).
2. Add namespace-guard tests and implementation; complete all active naming replacements until the guard passes.
3. Add explicit CI jobs for namespace/tests/typecheck and Windows first-run smoke.
4. Reconcile active documentation, feature pointer, roadmap, and 014/015 delivery records.
5. Run the full release-integrity gate and audit scope/lockfile/status.

## Requirement Coverage

| Requirements | Implemented by |
|---|---|
| FR-001, FR-002 | Tasks 1 and 2 |
| FR-003, FR-004, FR-005, FR-006 | Tasks 1 and 5 |
| FR-007 | Task 3 |
| FR-008, FR-009 | Task 2 |
| FR-010, FR-011, FR-012, FR-016 | Task 4 |
| FR-013, FR-014, FR-015 | Global constraints plus Task 5 final audit |
| SC-001, SC-002, SC-003 | Tasks 1, 2, and 5 |
| SC-004 | Task 3 |
| SC-005 | Task 2 |
| SC-006 | Task 4 |
| SC-007, SC-008 | Global constraints plus Task 5 final audit |

## Complexity Tracking

No constitution violations or new architectural layers. The only new executable unit is a dependency-free repository validation script with a pure testable core.
