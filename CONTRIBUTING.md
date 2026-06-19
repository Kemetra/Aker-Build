# Contributing to TenantGuard

TenantGuard is built with its own spec-first workflow. Keep changes scoped, evidence-backed, and local-first.

## Setup

```bash
pnpm install
pnpm test
pnpm typecheck
```

For the first-run path:

```bash
pwsh -File scripts/smoke-first-run.ps1
```

## Workflow

1. Read `CLAUDE.md` and the relevant `specs/<id>/**` files before editing.
2. Work from a reviewed spec, plan, and tasks file.
3. Keep changes inside the allowed files listed by the task file.
4. Run the smallest useful verification first, then the full workspace checks before handoff.
5. Do not commit, push, open PRs, or stage files unless explicitly requested by a maintainer.

## Pull Request Expectations

- Explain the objective, evidence used, and validation run.
- Include paths for changed public contracts or docs.
- Keep PRs focused on one spec/task slice.
- Do not include secrets, credentials, `.env` files, private domain logic, or generated lockfile churn.
- Do not add GitHub App, hosted dashboard, auto-fix, auto-commit, or auto-merge behavior unless a later reviewed spec explicitly approves it.

## Good First Issues

Good first issues should be small, independently verifiable, and scoped to docs, examples, fixtures, tests, or narrowly bounded CLI polish. A good first issue should include:

- The relevant spec/task link.
- Allowed files.
- Validation commands.
- Stop conditions.

Avoid issues that require broad architecture decisions, new dependencies, secret handling, hosted infrastructure, or mutating GitHub/repo state.
