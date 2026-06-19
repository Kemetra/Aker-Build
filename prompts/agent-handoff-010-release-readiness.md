# Agent Handoff: 010 Release Readiness and First-Run Demo

Use this only after maintainer approval.

```text
You are working in the TenantGuard repository.

Objective:
Prepare a docs-first 010 release-readiness slice that reconciles post-foundation status and creates a clear first-run demo plan. Do not implement production code unless the existing spec/plan/tasks explicitly allow it.

First, verify repo state:
- Run: git status --short
- Confirm current branch.
- Read:
  - README.md
  - CLAUDE.md
  - .specify/memory/constitution.md
  - docs/tenantguard_project_blueprint.md
  - packages/cli/src/index.ts
  - packages/cli/README.md
  - specs/009-launch-and-community-strategy/spec.md
- Stop if unrelated uncommitted changes exist.

Context:
Foundation and nine specs are complete. Current main says MVP CLI and report-only dogfooding exist. The next safe work is release confidence: reconcile stale docs, document actual commands, and prepare the first-run demo. Do not start GitHub App, hosted dashboard, auto-fix, auto-commit, or auto-merge work.

Allowed files:
- docs/status/post-foundation-reconciliation.md
- docs/roadmap/post-foundation-technical-plan.md
- docs/decisions/ADR-008-post-foundation-sequence.md
- specs/010-release-readiness-and-first-run-demo/**
- packages/cli/README.md
- README.md
- CLAUDE.md only if active pointer is stale
- specs/009-launch-and-community-strategy/spec.md status line only, if approved

Forbidden files:
- Hosted dashboard code
- GitHub App code
- Auto-fix / auto-commit / auto-merge behavior
- Secret/env files
- Retail Tower / ERPNext / POS-specific logic
- package files or lockfiles unless explicitly approved

Validation:
- pnpm test
- pnpm typecheck
- Verify documented commands match packages/cli/src/index.ts

Git rules:
- Do not commit unless explicitly requested.
- Do not push unless explicitly requested.
- Do not open a PR unless explicitly requested.
- Stage named files only if staging is explicitly requested.
- Never use git add -A.
- Never use git add .

Stop conditions:
- Required files are missing.
- The task requires package/lockfile changes not approved.
- You need to create production code before tasks are reviewed.
- Any secret-like content appears in docs/demo materials.
- Scope drifts into GitHub App, dashboard, or mutation features.

Final report:
Return:
- Files changed
- Summary of changes
- Tests run and results
- Evidence used
- Risks/gaps
- Git status
- Next safe action
```
