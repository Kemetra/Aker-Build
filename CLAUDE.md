# CLAUDE.md

You are working in the Aker Build repository.

Aker Build is a CLI-first SaaS Build Kernel. It helps teams build multi-tenant SaaS systems with GitHub, specs, gates, derived queues, PR verification, and safe AI-agent prompts.

---

## Product Direction

Aker Build is not a SaaS boilerplate and not a generic task manager. It is a build-control kernel.

Core flow:

```text
scan sources
→ build project map
→ run rules/gates
→ derive queue
→ route next safest task
→ compile agent prompt
→ review result or PR
```

One-line positioning:

> Build SaaS with AI agents without losing architecture control.

---

## Current Phase

MVP implementation / dogfooding, with report output contract hardening active.

The MVP CLI is implemented (`scan`, `map`, `gates`, `queue`, `route`, `prompt`, `review-pr`, `report`).

Implementation is allowed only through reviewed spec, plan, and tasks files. Do not implement production code unless a reviewed spec, plan, and tasks file explicitly allow it.

A report-only GitHub Action dogfood workflow exists (Aker Build runs against its own repo and reports; it does not auto-fix or auto-merge).

The "Fortify, then Expand" roadmap is approved (2026-06-21). FORTIFY (P1–P3) and the self-hostable, single-tenant **report-only GitHub App (P4)** are implemented — see `specs/014-github-app-report-only/` and `specs/015-github-app-deployment/`. The App must stay report-only (Checks run + annotations only; no mutation), stateless, and secret-safe.

The hosted dashboard / org view (P5) and any enforcing/blocking-merge check (P6) remain deferred and unapproved.

---

## Technical Direction

- Language: TypeScript
- Runtime: Node.js LTS
- Package manager: pnpm
- Tests: Vitest
- Schema validation: Zod
- CLI first
- GitHub Action later
- GitHub App later
- Hosted dashboard later

---

## Spec Workflow

Use Spec Kit for Aker Build planning when available:

1. constitution
2. specify
3. plan
4. tasks
5. implementation only after approval

Aker Build itself must be Spec Kit compatible but not Spec Kit dependent.

---

## MVP Scope

MVP commands:

```bash
aker-build init
aker-build scan
aker-build map
aker-build gates
aker-build queue
aker-build route
aker-build prompt Q-001 --agent claude
aker-build prompt Q-001 --agent codex
aker-build review-pr --local-diff
aker-build report
```

MVP outputs:

```text
project-map.json
risks.json
queue.json
aker-build-report.md
aker-build-report.json
safe agent prompt
PR/readiness report
```

---

## Hard Rules

- Do not copy Retail Tower domain logic.
- Do not add ERPNext-specific logic.
- Do not add hosted dashboard code in MVP.
- Do not add GitHub App code in MVP.
- Do not execute AI agents from the product in MVP.
- Do not store or print secrets.
- Do not make broad refactors.
- Do not change lockfiles unless package changes are explicitly approved.
- Do not commit, push, or open PRs unless explicitly requested.
- Never use `git add -A`.
- Never use `git add .`.
- Stage named files only when staging is explicitly requested.

---

## Required Behavior Before Edits

Before changing files:

1. Run `git status --short`.
2. Identify the current branch.
3. Read the relevant spec, plan, and tasks files.
4. Confirm allowed files and forbidden files.
5. Stop if unrelated uncommitted changes exist.

---

## Default Gates

```text
TG-G0 Source Truth Gate
TG-G1 Architecture Boundary Gate
TG-G2 Contract/API Gate
TG-G3 Migration Safety Gate
TG-G4 Security/Tenant Isolation Gate
TG-G5 Idempotency Gate
TG-G6 Billing/Usage Gate
TG-G7 Observability Gate
TG-G8 Dependency/Upgrade Gate
TG-G9 Release Readiness Gate
```

---

## Prompt Safety Requirements

Any generated AI-agent prompt must include:

```text
Objective
Repo-state verification
Context
Allowed files
Forbidden files
Validation commands
Git rules
Stop conditions
Final report format
```

---

## Required Final Report

Every implementation response must include:

- Files changed
- Summary of changes
- Tests run and results
- Evidence used
- Risks or gaps
- Git status
- Next safe action

---

## Implementation Boundary

No implementation should start until these are reviewed:

```text
/specs/001-product-foundation/spec.md
/docs/product/vision.md
/docs/product/mvp-scope.md
/docs/product/non-goals.md
/docs/architecture/kernel.md
/docs/architecture/project-map-schema.md
/docs/architecture/gates.md
/docs/decisions/ADR-000-product-direction.md
/docs/decisions/ADR-001-tech-stack.md
/docs/decisions/ADR-002-spec-kit-position.md
```

After review, the next spec is:

```text
002-project-map-schema
```

Then:

```text
003-cli-scanner
```

Do not implement CLI scanner before the Project Map schema exists.

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan:
`specs/016-release-integrity/plan.md` (active feature: 016-release-integrity).
<!-- SPECKIT END -->
