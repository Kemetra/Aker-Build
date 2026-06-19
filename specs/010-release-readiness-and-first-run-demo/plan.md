# Implementation Plan: 010 Release Readiness and First-Run Demo

Status: Implemented in branch `010-release-readiness-and-first-run-demo`
Feature: `010-release-readiness-and-first-run-demo`
Date: 2026-06-19

## Technical summary

Create a post-foundation release-readiness slice that reconciles stale docs, documents every implemented CLI command, adds a safe first-run demo path, and prepares the repo for public activation.

This is not a launch-execution feature. It is the gate before launch execution.

## Scope

Allowed areas, subject to tasks approval:

```text
README.md
CLAUDE.md only if active feature pointer is stale
CONTRIBUTING.md
LICENSE
docs/status/**
docs/roadmap/**
docs/demo/**
docs/decisions/ADR-008-post-foundation-sequence.md
packages/cli/README.md
specs/009-launch-and-community-strategy/spec.md status line only, if approved
specs/010-release-readiness-and-first-run-demo/**
examples/multi-tenant-saas-basic/**
scripts/smoke-first-run.* only if approved
tests/demo/** or package-local tests only if approved
```

Forbidden areas:

```text
Hosted dashboard code
GitHub App code
Auto-fix / auto-commit / auto-merge behavior
Secrets or env files
Retail Tower / ERPNext / POS-specific rules
Broad package rewrites
Lockfile changes unless a package/dependency change is explicitly approved
```

## Proposed work breakdown

### Phase 1: Docs reconciliation

- Update post-foundation status.
- Fix spec numbering drift in blueprint or add a status note superseding old numbering.
- Update `packages/cli/README.md` to include `gates`, `queue`, `route`, `prompt`, `review-pr`.
- Confirm `CLAUDE.md` active feature pointer does not route work back to an already merged 009.

### Phase 2: First-run demo design

- Define the demo story: a sanitized SaaS repo with intentionally detectable architecture/security/contract/idempotency cues.
- Keep it domain-neutral.
- Avoid private project names, secrets, or ERPNext/Retail Tower logic.

### Phase 3: Example repo and golden path

- Add `examples/multi-tenant-saas-basic/` if approved by tasks.
- Include minimal files enough for scanner/gates to produce meaningful output.
- Add expected output notes or fixtures where appropriate.

### Phase 4: Smoke validation

Document and optionally automate:

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm --filter @tenantguard/cli exec tenantguard scan examples/multi-tenant-saas-basic --out .tenantguard-demo
pnpm --filter @tenantguard/cli exec tenantguard gates examples/multi-tenant-saas-basic --out .tenantguard-demo
pnpm --filter @tenantguard/cli exec tenantguard queue examples/multi-tenant-saas-basic --out .tenantguard-demo
pnpm --filter @tenantguard/cli exec tenantguard route examples/multi-tenant-saas-basic --out .tenantguard-demo
pnpm --filter @tenantguard/cli exec tenantguard prompt Q-001 --agent claude --out .tenantguard-demo
```

Adjust exact package command based on actual workspace scripts.

### Phase 5: Launch-readiness bridge

- Map remaining 009 checklist items to issues or follow-up tasks.
- Do not write launch posts yet.
- Do not claim public launch readiness unless the checklist passes.

## Validation

Required:

```bash
pnpm test
pnpm typecheck
```

If demo smoke script is added:

```bash
pnpm smoke:first-run
```

Manual validation:

- README quickstart matches actual commands.
- Demo produces visible, understandable output.
- No secrets in demo repo or outputs.
- No deferred feature claims.

Implemented validation:

```bash
pwsh -File scripts/smoke-first-run.ps1
pnpm test
pnpm typecheck
```

## Risks

| Risk | Mitigation |
|---|---|
| Demo overfits to TenantGuard internals | Use a SaaS-shaped example, not TenantGuard itself. |
| Output claims exceed implementation | Map every claim to a real command/output. |
| Secret leakage in fixtures | Use obviously fake placeholders and secret scanner tests if available. |
| Scope creep into distribution or Action | Keep npm/Action to ADR/spec follow-ups, not this implementation unless explicitly approved. |

## Stop conditions

Stop and report if:

- Actual CLI command names differ from docs.
- Demo requires new architecture decisions not covered here.
- A package/lockfile change becomes necessary without approval.
- Any secret-like value appears in demo files or outputs.
- The task starts drifting into GitHub App/dashboard/auto-fix work.
