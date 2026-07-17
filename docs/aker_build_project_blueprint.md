# Aker Build Project Blueprint

**Working name:** Aker Build
**Product type:** CLI-first SaaS Build Kernel  
**Status:** Product foundation / source-ready planning file  
**Primary audience:** founders, SaaS teams, agencies, and engineering teams using GitHub + specs + AI coding agents  
**Origin:** Clean extraction from Retail Tower OS operating practices, not a copy-paste of Retail Tower domain logic.

---

## 1. Executive Decision

Aker Build is a side product derived from the operating lessons of Retail Tower OS.

It is **not** a SaaS boilerplate and it is **not** a generic task manager. It is a control kernel that helps teams build and maintain multi-tenant SaaS systems without losing architecture control when using GitHub, specs, CI, and AI coding agents such as Claude Code, Codex, Cursor, or similar tools.

### One-line product statement

> Build SaaS with AI agents without losing architecture control.

### Arabic positioning

> ابني SaaS بالـ AI من غير ما المشروع يفلت منك.

### Strategic decision

We will not copy the Retail Tower Orchestrator as-is, and we will not start from scratch. We will perform a **clean extraction**:

```text
Retail Tower OS operating discipline
→ generalized SaaS rules and workflows
→ Aker Build Kernel
→ reusable product for any SaaS repo
```

### What Aker Build should control

Aker Build should help answer:

```text
What is the current repo truth?
What is risky?
What is blocked?
What is the next safest task?
What files may an AI agent touch?
What validations are required?
Is this PR ready to merge?
Did docs/specs drift from code?
```

---

## 2. Product Goals

Aker Build should provide a practical build-control workflow for SaaS teams.

### Goals

1. Map a SaaS project from source evidence.
2. Detect architecture, security, tenant isolation, migration, contract, and idempotency risks.
3. Derive an execution queue from actual evidence instead of stale manual todos.
4. Select the next safest task.
5. Compile safe, narrow prompts for AI coding agents.
6. Review pull requests against declared scope, gates, and evidence.
7. Work locally first, then integrate with GitHub Actions and later a GitHub App.
8. Support Spec Kit projects, but not require Spec Kit.

### Non-goals for MVP

Aker Build MVP will not include:

```text
- Hosted SaaS dashboard
- Billing/subscriptions
- GitHub App
- Direct AI agent execution
- Auto-fix
- Auto-commit
- Auto-merge
- Deep support for every language/framework
- OPA/Rego policy engine
- Full static analysis engine
- Retail Tower private domain logic
- ERPNext-specific rules
```

---

## 3. Target Users

### Primary users

1. Founders and indie hackers building SaaS with AI coding agents.
2. Small engineering teams using GitHub PRs and AI-assisted development.
3. Agencies building multi-tenant products for clients.
4. SaaS teams with stale docs, unclear boundaries, and risky migrations.

### Main pain points

```text
- AI agents change too many files.
- Teams do not know the next safe task.
- Docs/specs drift from code.
- PRs pass tests but break architecture boundaries.
- Tenant isolation is not consistently verified.
- Migrations are risky or undocumented.
- Background jobs lack idempotency.
- API contracts change without consumer updates.
- CI is present but does not enforce product-specific gates.
```

---

## 4. Product Principles

These principles should be treated as the initial project constitution.

### P1 — Source truth first

Aker Build must inspect current repo state, local diff, GitHub PR state, or CI evidence before claiming status, readiness, or blockers.

### P2 — CLI first

The first usable product is a local CLI. Dashboard and hosted SaaS come later.

### P3 — Evidence-based rules

Every risk, gate failure, and recommendation should include evidence: file path, line if available, changed file, missing artifact, failed command, or PR metadata.

### P4 — Spec-compatible, not Spec Kit dependent

Aker Build should read Spec Kit artifacts when present, but should work without Spec Kit.

### P5 — Agent safety by default

Generated prompts must include objective, allowed files, forbidden files, validation, git rules, stop conditions, and final report format.

### P6 — No hidden mutation

MVP must not execute agents, commit, push, open PRs, or mutate GitHub state unless explicitly implemented as a later, approved feature.

### P7 — No secrets

Aker Build must not store, print, transmit, or include secrets in reports/prompts.

### P8 — General SaaS kernel

Aker Build must not leak Retail Tower-specific domain logic. Retail Tower can be a private dogfooding source, not the public product model.

---

## 5. Core Workflow

Aker Build follows this operating flow:

```text
scan sources
→ build project map
→ run rules/gates
→ derive queue
→ route next safest task
→ compile agent prompt
→ review result or PR
→ close or create follow-up
```

### CLI command model

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
aker-build review-pr 123
aker-build report
```

---

## 6. MVP Scope

The MVP is a local CLI that can run against a repository and produce useful reports.

### MVP must support

```text
1. Scan a local repo.
2. Detect basic project structure.
3. Produce project-map.json.
4. Run SaaS gates v0.
5. Produce risks.json.
6. Produce queue.json.
7. Select one next safest task.
8. Generate Claude/Codex-safe prompts.
9. Review local diffs.
10. Produce Markdown and JSON reports.
```

### MVP success criteria

Aker Build MVP is successful when this works:

```bash
aker-build scan
aker-build queue
aker-build route
aker-build prompt Q-001 --agent claude
aker-build review-pr --local-diff
```

And outputs:

```text
- Project map
- Risk list
- Derived queue
- One next safe action
- Safe agent prompt
- PR/readiness report
```

---

## 7. Technology Decisions

### Final MVP stack

| Area | Decision |
|---|---|
| Primary language | TypeScript |
| Runtime | Node.js LTS |
| Package manager | pnpm |
| CLI framework | Commander or oclif |
| Testing | Vitest |
| Schema validation | Zod |
| Config | YAML + JSON |
| Local storage | JSON files first, SQLite later |
| GitHub integration | GitHub CLI / Octokit later |
| Rules engine v0 | TypeScript rules + YAML config |
| Policy engine later | OPA/Rego optional |
| Dashboard later | Next.js + PostgreSQL |

### Why TypeScript first

TypeScript gives the fastest path for:

```text
- CLI distribution through npm
- GitHub API integration
- JSON/YAML/schema-heavy tooling
- SaaS repo compatibility
- Developer adoption
- Fast iteration with AI coding agents
```

### Deferred technology

```text
- Rust: good for high-performance binaries, not needed for MVP.
- Go: good for CLIs, but TypeScript is faster for this product's ecosystem.
- Python: useful for analysis, but less ideal for npm-first SaaS developer distribution.
- OPA/Rego: powerful policy engine, but premature before rule model stabilizes.
```

---

## 8. Architecture

### High-level architecture

```text
Repo / PR / Spec files
        ↓
Source Adapters
        ↓
Project Map Builder
        ↓
Rule Engine
        ↓
Derived Queue
        ↓
Router
        ↓
Prompt Compiler
        ↓
Verification Engine
        ↓
Report / GitHub Comment / CI Gate
```

### Package layout

```text
packages/core
  kernel
  project-map
  queue
  gates
  router
  lock-scopes

packages/cli
  aker-build command entrypoints

packages/github
  PR metadata
  changed files
  checks
  GitHub comments later

packages/spec-kit-adapter
  .specify reader
  spec/plan/tasks/checklists mapper

packages/rules-saas
  tenant isolation rules
  auth rules
  migration rules
  idempotency rules
  API contract rules
  observability rules

packages/prompt-compiler
  Claude prompt renderer
  Codex prompt renderer
  generic agent prompt renderer

packages/reporters
  markdown reporter
  json reporter
  CI summary reporter
```

---

## 9. Project Map Schema

Aker Build needs a canonical map of the target project.

### Example

```yaml
version: 1
project:
  name: example-saas
  detected_stack:
    runtime: node
    package_manager: pnpm
    frameworks:
      - nextjs
      - nestjs

repos:
  - name: api
    path: apps/api
    type: backend
    owns:
      - auth
      - tenants
      - billing
      - jobs

  - name: web
    path: apps/web
    type: frontend
    owns:
      - admin-ui

  - name: worker
    path: apps/worker
    type: worker
    owns:
      - async-jobs

boundaries:
  - id: B-001
    rule: frontend_calls_api_only
    description: Frontend must not call database directly.

  - id: B-002
    rule: worker_has_no_public_routes
    description: Worker must not expose public HTTP endpoints unless explicitly approved.

tenant_model:
  strategy: shared_db_shared_schema
  tenant_key: tenant_id
  required_surfaces:
    - api_routes
    - db_queries
    - background_jobs
    - reports

critical_surfaces:
  - api_routes
  - db_migrations
  - background_jobs
  - webhooks
  - billing_usage
  - auth_guards
```

---

## 10. SaaS Gates v0

Aker Build gates are generalized from real multi-repo SaaS operating discipline.

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

### TG-G0 — Source Truth Gate

No routing, prompt generation, or readiness claim before reading source evidence.

Evidence examples:

```text
- repo files
- git status
- local diff
- GitHub PR metadata
- CI status
- spec files
```

### TG-G1 — Architecture Boundary Gate

Detects suspicious boundary violations.

Examples:

```text
- frontend importing backend internals
- worker exposing public HTTP routes unexpectedly
- direct database access from UI
- integration adapter bypassing API boundary
```

### TG-G2 — Contract/API Gate

Detects API contract drift.

Examples:

```text
- route changed without OpenAPI update
- OpenAPI changed without generated client update
- public response shape changed without tests
```

### TG-G3 — Migration Safety Gate

Detects risky database changes.

Examples:

```text
- destructive migration
- dropped column/table
- non-null column without default
- migration without rollback note
- migration without test or seed consideration
```

### TG-G4 — Security/Tenant Isolation Gate

Detects missing or risky tenant boundaries.

Examples:

```text
- API route without auth guard
- query without tenant filter
- admin route without role guard
- tenant_id missing from new table
- secrets printed in logs
```

### TG-G5 — Idempotency Gate

Detects mutation flows that can duplicate work.

Examples:

```text
- webhook handler without signature/idempotency tracking
- background job without idempotency key
- payment/billing action without replay protection
- external posting call without dedupe key
```

### TG-G6 — Billing/Usage Gate

Detects billing-sensitive issues.

Examples:

```text
- usage event without tenant/account id
- plan limit bypass
- unmetered expensive operation
- pricing config changed without tests
```

### TG-G7 — Observability Gate

Detects missing operational signals.

Examples:

```text
- critical mutation without audit event
- job without structured logs
- external integration without correlation id
- retry/dead-letter path missing
```

### TG-G8 — Dependency/Upgrade Gate

Detects dependency risks.

Examples:

```text
- lockfile changed unexpectedly
- major dependency upgrade without notes
- CI version mismatch
- runtime version drift
```

### TG-G9 — Release Readiness Gate

Detects release blockers.

Examples:

```text
- critical gates failing
- CI failing
- no rollback note for risky change
- unresolved high-risk PR review finding
```

---

## 11. Queue Item Contract

Aker Build queue items should be explicit and safe for agent handoff.

```yaml
id: Q-004
title: Add tenant isolation tests for invoices API
status: ready
type: implementation
repo: api
source:
  evidence:
    - file: apps/api/src/invoices/invoices.controller.ts
    - rule: TG-G4
priority: high
risk: medium
depends_on:
  - Q-001
lock_scope:
  files:
    - apps/api/src/invoices/**
    - apps/api/test/invoices/**
allowed_files:
  - apps/api/src/invoices/**
  - apps/api/test/invoices/**
forbidden_files:
  - apps/api/src/auth/**
  - apps/api/prisma/migrations/**
gates:
  - TG-G4
  - TG-G5
validation:
  - pnpm test invoices
  - pnpm lint
stop_conditions:
  - auth model is unclear
  - migration is required
  - unrelated tests fail
final_report:
  required:
    - files_changed
    - tests_run
    - evidence_used
    - risks_or_gaps
    - git_status
```

---

## 12. Router Rules

The router selects exactly one next safest item by default.

### Router inputs

```text
- current project map
- risk findings
- queue items
- dependencies
- lock scopes
- current local diff
- current PR state if available
- failed gates
```

### Router scoring factors

```text
readiness
risk
blast radius
dependency status
validation availability
scope clarity
lock overlap
documentation freshness
```

### Router output

```yaml
next:
  id: Q-004
  title: Add tenant isolation tests for invoices API
  reason:
    - Contract exists
    - No migration required
    - Small isolated file scope
    - Validation command is known
blocked:
  - id: Q-005
    reason: API contract not signed
```

---

## 13. Prompt Compiler Requirements

Generated prompts must be safe, narrow, and copy-paste-ready.

### Required sections

```text
Objective
Repo-state verification
Context
Scope
Allowed files
Forbidden files
Validation commands
Git rules
Stop conditions
Final report format
```

### Default git rules

```text
- Do not commit unless explicitly requested.
- Do not push unless explicitly requested.
- Do not open a PR unless explicitly requested.
- Stage named files only.
- Never use git add -A.
- Never use git add .
- Do not modify secrets or credentials.
```

### Default stop conditions

```text
- Required files are missing.
- Scope requires migration but task did not allow migrations.
- Public API shape must change but contract update was not in scope.
- Auth or tenant model is unclear.
- Validation cannot run.
- Unrelated test failures appear.
```

---

## 14. Example Agent Prompt Template

```text
You are working in the Aker Build repository.

Objective:
Implement only the selected queue item: {{QUEUE_ID}} — {{TITLE}}.

First, verify repo state:
- Run: git status --short
- Confirm the current branch.
- Inspect the files listed under allowed scope before editing.
- Stop if there are unrelated uncommitted changes.

Context:
{{CONTEXT}}

Allowed files:
{{ALLOWED_FILES}}

Forbidden files:
{{FORBIDDEN_FILES}}

Validation:
{{VALIDATION_COMMANDS}}

Git rules:
- Do not commit unless explicitly requested.
- Do not push unless explicitly requested.
- Do not open a PR unless explicitly requested.
- Stage named files only if staging is explicitly requested.
- Never use git add -A.
- Never use git add .
- Do not modify secrets, credentials, environment files, or generated lockfiles unless explicitly allowed.

Stop conditions:
{{STOP_CONDITIONS}}

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

---

## 15. Spec Kit Position

Aker Build should use Spec Kit for its own build workflow, but should not require users to use Spec Kit.

### Internal build workflow

Use:

```text
/speckit.constitution
/speckit.specify
/speckit.plan
/speckit.tasks
```

Do not use:

```text
/speckit.implement
```

until the generated spec, plan, and tasks have been reviewed.

### Aker Build product behavior

Aker Build should support:

```text
- projects with .specify/
- projects with plain docs
- projects with no formal specs
```

### Spec Kit adapter should read

```text
.specify/memory/constitution.md
spec.md
plan.md
tasks.md
checklists
```

And convert them into:

```text
Project Map
Queue Items
Gates
Prompt Context
```

---

## 16. Initial Specs

Create feature specs in this order.

```text
001-product-foundation
002-project-map-schema
003-cli-scanner
004-saas-gates-v0
005-derived-queue-router
006-agent-prompt-compiler
007-pr-reviewer
008-github-action
009-spec-kit-adapter
010-example-project
```

### 001-product-foundation

Purpose:

```text
Define product direction, target users, MVP scope, non-goals, workflow, principles, and acceptance criteria.
```

No production code.

### 002-project-map-schema

Purpose:

```text
Define the versioned Project Map schema and required JSON/YAML outputs.
```

### 003-cli-scanner

Purpose:

```text
Implement basic local repo scanning and project-map output.
```

### 004-saas-gates-v0

Purpose:

```text
Implement initial SaaS gate checks with evidence-based findings.
```

### 005-derived-queue-router

Purpose:

```text
Generate queue items and select one next safest task.
```

### 006-agent-prompt-compiler

Purpose:

```text
Generate safe prompts for Claude, Codex, and generic coding agents.
```

### 007-pr-reviewer

Purpose:

```text
Review local diff and GitHub PR changes against scope and gates.
```

### 008-github-action

Purpose:

```text
Run Aker Build in CI and produce PR summaries.
```

### 009-spec-kit-adapter

Purpose:

```text
Read Spec Kit artifacts and map them to Aker Build project map, queue, and prompt context.
```

### 010-example-project

Purpose:

```text
Provide a sanitized multi-tenant SaaS example repo for demos and tests.
```

---

## 17. Delivery Waves

### Wave 0 — Product foundation and decisions

Deliverables:

```text
README.md
docs/product/vision.md
docs/product/non-goals.md
docs/architecture/kernel.md
docs/architecture/project-map-schema.md
docs/architecture/rule-engine.md
docs/decisions/ADR-000-product-direction.md
docs/decisions/ADR-001-tech-stack.md
docs/decisions/ADR-002-spec-kit-position.md
```

Exit gate:

```text
- Product direction approved.
- MVP scope approved.
- Tech stack approved.
- Spec Kit position approved.
- No production code yet.
```

### Wave 1 — CLI skeleton

Deliverables:

```text
aker-build --version
aker-build init
aker-build scan
aker-build map
project-map.json
basic markdown report
```

Exit gate:

```text
CLI runs locally without GitHub credentials.
```

### Wave 2 — Rules and gates MVP

Deliverables:

```text
aker-build gates
aker-build queue
aker-build route
risks.json
queue.json
```

Exit gate:

```text
Tool produces useful risks and a next safe task from a local repo.
```

### Wave 3 — Prompt compiler

Deliverables:

```text
aker-build prompt Q-001 --agent claude
aker-build prompt Q-001 --agent codex
```

Exit gate:

```text
Generated prompts are copy-paste-ready and scope-limited.
```

### Wave 4 — PR reviewer

Deliverables:

```text
aker-build review-pr --local-diff
aker-build review-pr 123
```

Exit gate:

```text
Tool returns Ready / Not Ready / Needs Verification with evidence.
```

### Wave 5 — GitHub Action

Deliverables:

```text
GitHub Action usage example
CI summary report
critical gate failure support
```

Exit gate:

```text
A repository can run Aker Build in pull_request workflows.
```

### Wave 6 — GitHub App

Deferred until CLI and Action are useful.

Deliverables later:

```text
PR comments
risk labels
follow-up issue creation
org-level install
```

### Wave 7 — Hosted dashboard

Deferred until product pull exists.

Deliverables later:

```text
org dashboard
repo health
queue history
PR risk trends
team policies
billing
```

---

## 18. Suggested Repository Structure

```text
aker-build/
  README.md
  CLAUDE.md
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json

  docs/
    product/
      vision.md
      target-users.md
      non-goals.md
      mvp-scope.md
    architecture/
      kernel.md
      project-map-schema.md
      rule-engine.md
      queue-engine.md
      prompt-compiler.md
      github-integration.md
    decisions/
      ADR-000-product-direction.md
      ADR-001-tech-stack.md
      ADR-002-spec-kit-position.md
      ADR-003-cli-first.md

  specs/
    001-product-foundation/
      spec.md
      plan.md
      tasks.md
    002-project-map-schema/
      spec.md
    003-cli-scanner/
      spec.md

  packages/
    core/
      src/
      test/
    cli/
      src/
      test/
    github/
      src/
      test/
    spec-kit-adapter/
      src/
      test/
    rules-saas/
      src/
      test/
    prompt-compiler/
      src/
      test/
    reporters/
      src/
      test/

  examples/
    multi-tenant-saas-basic/

  .github/
    workflows/
      ci.yml
      aker-build.yml
```

---

## 19. GitHub Source Files to Create First

Start with these files only:

```text
README.md
CLAUDE.md
docs/product/vision.md
docs/product/non-goals.md
docs/product/mvp-scope.md
docs/architecture/kernel.md
docs/architecture/project-map-schema.md
docs/architecture/gates.md
docs/architecture/prompt-compiler.md
docs/decisions/ADR-000-product-direction.md
docs/decisions/ADR-001-tech-stack.md
docs/decisions/ADR-002-spec-kit-position.md
specs/001-product-foundation/spec.md
```

Do not create package code until `001-product-foundation`, `002-project-map-schema`, and `003-cli-scanner` are reviewed.

---

## 20. Initial README Draft

```markdown
# Aker Build

Aker Build is a CLI-first SaaS Build Kernel for teams building multi-tenant SaaS systems with GitHub, specs, CI, and AI coding agents.

It helps teams answer:

- What is the current source truth?
- What is risky?
- What is blocked?
- What is the next safest task?
- What files may an AI agent touch?
- Is this PR ready to merge?

Aker Build is not a SaaS boilerplate. It does not generate a full app. It controls the build process around architecture, gates, queues, prompts, and verification.

## MVP

The first version is a local CLI:

```bash
aker-build scan
aker-build queue
aker-build route
aker-build prompt Q-001 --agent claude
aker-build review-pr --local-diff
```

## Core flow

```text
scan sources
→ build project map
→ run gates
→ derive queue
→ route next safest task
→ compile agent prompt
→ review result/PR
```

## Status

Product foundation stage. No production code yet.
```

---

## 21. Initial CLAUDE.md Draft

```markdown
# CLAUDE.md

You are working in the Aker Build repository.

Aker Build is a CLI-first SaaS Build Kernel. It helps teams build multi-tenant SaaS systems with GitHub, specs, gates, derived queues, PR verification, and safe AI-agent prompts.

## Product direction

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

## Current phase

Docs-first product foundation. Do not implement production code unless a reviewed spec, plan, and tasks file explicitly allow it.

## Technical direction

- Language: TypeScript
- Runtime: Node.js LTS
- Package manager: pnpm
- Tests: Vitest
- Schema validation: Zod
- CLI first
- GitHub integration later
- Dashboard later

## Spec workflow

Use Spec Kit for Aker Build planning when available:

1. constitution
2. specify
3. plan
4. tasks
5. implementation only after approval

Aker Build itself must be Spec Kit compatible but not Spec Kit dependent.

## Hard rules

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

## Required behavior before edits

Before changing files:

1. Run `git status --short`.
2. Identify the current branch.
3. Read the relevant spec/plan/tasks files.
4. Confirm allowed and forbidden files.
5. Stop if unrelated uncommitted changes exist.

## Required final report

Every implementation response must include:

- Files changed
- Summary of changes
- Tests run and results
- Evidence used
- Risks or gaps
- Git status
- Next safe action
```

---

## 22. First Spec Prompt

Use this as the first Spec Kit prompt.

```text
/speckit.constitution

Create governing principles for Aker Build, a CLI-first SaaS Build Kernel that helps teams build multi-tenant SaaS systems with GitHub, specs, gates, PR verification, and AI-agent prompt compilation.

Aker Build must be:
- CLI-first for MVP
- GitHub-first but locally usable
- Spec Kit compatible but not Spec Kit dependent
- secure by default
- evidence-based
- agent-safe by default
- general SaaS focused

Aker Build must not:
- copy Retail Tower domain logic
- expose private project details
- behave as a SaaS boilerplate
- execute AI agents in MVP
- auto-commit, auto-push, or auto-merge
- require hosted infrastructure in MVP
```

---

## 23. First Feature Prompt

```text
/speckit.specify

Feature: 001-product-foundation

Define the product foundation for Aker Build, a CLI-first SaaS Build Kernel extracted from Retail Tower OS operating practices through clean extraction, not copy-paste.

The feature must define:
1. Product vision.
2. Target users.
3. MVP scope.
4. Explicit non-goals.
5. Core workflow.
6. CLI-first delivery model.
7. Project Map concept.
8. SaaS Gates v0.
9. Derived Queue concept.
10. Router concept.
11. Prompt Compiler concept.
12. PR Review concept.
13. GitHub integration roadmap.
14. Spec Kit position.
15. Acceptance criteria.

Constraints:
- No production code.
- No package setup.
- No dashboard.
- No GitHub App.
- No AI agent execution.
- No Retail Tower private domain logic.
- No ERPNext-specific logic.

Acceptance criteria:
- Product direction is clear.
- MVP boundaries are testable.
- Non-goals are explicit.
- Architecture concepts are named.
- Initial specs are listed in dependency order.
- The feature can be reviewed before any implementation begins.
```

---

## 24. First Implementation Boundary

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

---

## 25. Final Working Plan

```text
Aker Build
= CLI-first SaaS Build Kernel

Stack:
TypeScript + Node.js LTS + pnpm + Vitest + Zod

Workflow:
Spec Kit for building Aker Build
Spec-compatible product behavior for users

Architecture:
Repo Scanner
→ Project Map
→ Rules/Gates
→ Derived Queue
→ Router
→ Prompt Compiler
→ PR Verifier

MVP:
Local CLI + reports + safe prompts + local PR/diff review

Later:
GitHub Action
GitHub App
Hosted dashboard
Policy plugins
Commercial SaaS
```
