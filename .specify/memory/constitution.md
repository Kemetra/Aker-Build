<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: MAJOR (1.0.0) — initial ratification of the Aker Build constitution.
  No prior version existed; this establishes the governing principles.

Principles defined (8, derived from blueprint §4 P1–P8 and §22 constraints):
  I.   Source Truth First            (was: P1)
  II.  CLI First                     (was: P2)
  III. Evidence-Based Findings       (was: P3)
  IV.  Spec-Compatible, Not Spec-Kit-Dependent (was: P4)
  V.   Agent Safety by Default       (was: P5)
  VI.  No Hidden Mutation            (was: P6)
  VII. No Secrets                    (was: P7)
  VIII.General SaaS Kernel — Clean Extraction (was: P8)

Added sections:
  - Core Principles (8 principles — more than the template's 5; justified: blueprint §4
    explicitly names these eight as "the initial project constitution", each testable)
  - MVP Scope & Constraints (Section 2) — from blueprint §2 non-goals + §22 must-not list
  - Development Workflow & Quality Gates (Section 3) — Spec Kit flow + TG-G0..TG-G9 gates
  - Governance

Removed sections: none (template was unfilled).

Templates requiring review for alignment:
  - .specify/templates/plan-template.md   ⚠ pending — verify "Constitution Check" gate
    references these principles (esp. III evidence, V agent safety, VI no mutation).
  - .specify/templates/spec-template.md   ⚠ pending — ensure no-production-code-in-foundation
    constraint is honored where the template asks for scope.
  - .specify/templates/tasks-template.md  ⚠ pending — ensure task types cover gates
    (testing, observability, migration safety, idempotency).
  - README.md / CLAUDE.md                  ✅ aligned — already state product direction,
    hard rules, and Spec Kit workflow consistent with this constitution.

Deferred TODOs: none. RATIFICATION_DATE set to 2026-06-18 (today, initial adoption).
-->

# Aker Build Constitution

Aker Build is a CLI-first SaaS Build Kernel. It helps teams build and maintain
multi-tenant SaaS systems with GitHub, specs, gates, derived queues, PR verification,
and safe AI-agent prompts — without losing architecture control. This constitution
defines the non-negotiable principles that govern how Aker Build itself is built and
how it behaves toward the projects it inspects.

## Core Principles

### I. Source Truth First
Aker Build MUST inspect current source evidence before claiming status, readiness, or
blockers. Acceptable evidence includes repo files, `git status`, the local diff, GitHub
PR metadata, CI status, and spec files. Aker Build MUST NOT route a task, generate a
prompt, or assert "ready"/"blocked"/"done" from memory, assumption, or stale manual
notes. When evidence is missing or unverifiable, the correct output is "needs
verification" — never an unverified assertion stated as fact.

### II. CLI First
The first usable product MUST be a local CLI that runs without GitHub credentials or
hosted infrastructure. The CLI is the canonical interface: text/JSON in, text/JSON out,
errors to stderr. GitHub Action, GitHub App, and hosted dashboard are later, separately
approved surfaces — they MUST NOT be prerequisites for core value. Rationale: a
locally-runnable CLI guarantees the kernel is testable, adoptable, and free of hidden
network or platform dependencies.

### III. Evidence-Based Findings
Every risk, gate failure, queue item, and recommendation MUST carry concrete evidence:
a file path, a line number where available, a changed file, a missing artifact, a failed
command, or PR metadata. A finding without evidence is a bug. Rationale: evidence is what
makes Aker Build's output trustworthy and safe to hand to an AI agent — it converts
opinions into verifiable claims.

### IV. Spec-Compatible, Not Spec-Kit-Dependent
Aker Build MUST read Spec Kit artifacts (`.specify/memory/constitution.md`, `spec.md`,
`plan.md`, `tasks.md`, checklists) when present, but MUST also work on projects with plain
docs or no formal specs. Aker Build uses Spec Kit for its own build workflow; it MUST NOT
require its users to adopt Spec Kit. Rationale: forcing a single planning methodology on
users narrows adoption and contradicts the goal of being a general SaaS kernel.

### V. Agent Safety by Default
Every AI-agent prompt Aker Build generates MUST include: Objective, Repo-state
verification, Context, Scope, Allowed files, Forbidden files, Validation commands, Git
rules, Stop conditions, and Final report format. Prompts MUST be narrow and scope-limited
by default. Rationale: unscoped prompts are the primary cause of agents changing too many
files and breaking architecture boundaries — the exact failure Aker Build exists to
prevent.

### VI. No Hidden Mutation
In MVP, Aker Build MUST NOT execute AI agents, commit, push, open PRs, merge, auto-fix,
or otherwise mutate repository or GitHub state. Any mutating capability is a later,
explicitly approved feature, never a default. The tool observes, reports, and recommends;
it does not act on the user's behalf without an approved, named feature. Rationale:
predictability and trust — a control kernel that silently mutates state cannot be trusted
as a source of truth.

### VII. No Secrets
Aker Build MUST NOT store, print, transmit, or embed secrets or credentials in any
report, prompt, project map, log, or generated artifact. Secret-like content encountered
in source MUST be treated as a finding to flag, never as data to surface. Rationale: a
build-control tool sees the whole repo; leaking a secret through a report or prompt would
turn a safety tool into an attack surface.

### VIII. General SaaS Kernel — Clean Extraction
Aker Build MUST NOT copy Retail Tower private domain logic or add ERPNext-specific rules.
It is a *clean extraction* of generalized SaaS operating discipline, not a copy-paste of
any one project. Retail Tower may serve as a private dogfooding source, never as the public
product model. Rationale: the product's value is being a reusable kernel for *any* SaaS
repo; leaking one project's domain logic would make it neither general nor shippable.

## MVP Scope & Constraints

The MVP is a local CLI that scans a repository and produces useful reports. It MUST
support: scan a local repo; detect project structure; produce `project-map.json`; run
SaaS gates v0; produce `risks.json` and `queue.json`; select one next safest task;
generate Claude/Codex-safe prompts; review local diffs; and emit Markdown + JSON reports.

The MVP MUST NOT include: a hosted SaaS dashboard, billing/subscriptions,
direct AI-agent execution, auto-fix, auto-commit, auto-merge, an OPA/Rego policy engine,
a full static-analysis engine, deep support for every language/framework, Retail Tower
private domain logic, or ERPNext-specific rules.

**Approved post-MVP surfaces (added v1.1.0, 2026-06-21):** The MVP is shipped/dogfooding
and the "Fortify, then Expand" roadmap is owner-approved
(`docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md`). A **report-only GitHub
App** is therefore an approved post-MVP surface (roadmap P4), subject to all standing
principles: it MUST remain report-only (Principle VI — no commit/push/merge/auto-fix/
agent-exec; its only write is a GitHub Checks run + annotations, which is not a repository
mutation), stateless, and secret-safe (Principle VII). This approval covers P4 only; the
hosted dashboard / org view (P5) and any enforcing/blocking-merge check (P6) remain
deferred and unapproved.

MVP success is demonstrated when this sequence works and produces a project map, risk
list, derived queue, one next safe action, a safe agent prompt, and a PR/readiness report:

```bash
aker-build scan
aker-build queue
aker-build route
aker-build prompt Q-001 --agent claude
aker-build review-pr --local-diff
```

Technology baseline (MVP): TypeScript on Node.js LTS, pnpm, Vitest for tests, Zod for
schema validation, JSON/YAML config, JSON files for local storage. Deferred until the rule
model stabilizes or product pull exists: SQLite, Octokit/GitHub App, OPA/Rego, hosted
dashboard. Lockfiles MUST NOT change unless a package change is explicitly approved.

## Development Workflow & Quality Gates

Aker Build is built using its own Spec Kit workflow, in order: `/speckit.constitution`
→ `/speckit.specify` → `/speckit.plan` → `/speckit.tasks` → implementation. Implementation
MUST NOT begin until the relevant spec, plan, and tasks files are reviewed and approved.
The current phase is docs-first product foundation: no production package code until
`001-product-foundation`, `002-project-map-schema`, and `003-cli-scanner` are reviewed.

Aker Build's own SaaS gates (v0) — the same gates the product enforces on user projects —
govern its development and any PR it reviews:

```text
TG-G0 Source Truth Gate            TG-G5 Idempotency Gate
TG-G1 Architecture Boundary Gate   TG-G6 Billing/Usage Gate
TG-G2 Contract/API Gate            TG-G7 Observability Gate
TG-G3 Migration Safety Gate        TG-G8 Dependency/Upgrade Gate
TG-G4 Security/Tenant Isolation    TG-G9 Release Readiness Gate
```

Git discipline (applies to every change, in every Aker Build repo):
- Do not commit, push, or open PRs unless explicitly requested.
- Stage named files only when staging is explicitly requested.
- Never use `git add -A` or `git add .`.
- Do not modify secrets, credentials, environment files, or generated lockfiles unless
  explicitly allowed.

Every implementation response MUST end with a final report containing: files changed,
summary of changes, tests run and results, evidence used, risks or gaps, git status, and
the next safe action.

## Governance

This constitution supersedes other development practices for the Aker Build repository.
Where a workflow, prompt, or template conflicts with these principles, the constitution
wins and the conflicting artifact MUST be corrected.

Amendments require: a written description of the change, explicit owner approval, and a
version bump per the policy below. Amendments that change principle meaning MUST be
propagated to dependent artifacts (`plan-template.md`, `spec-template.md`,
`tasks-template.md`, `README.md`, `CLAUDE.md`) in the same change.

Versioning policy (semantic):
- MAJOR: backward-incompatible governance changes — a principle removed or redefined.
- MINOR: a new principle or section added, or material expansion of guidance.
- PATCH: clarifications, wording, or non-semantic refinements.

Compliance review: every PR and review MUST verify compliance with these principles, with
particular attention to Source Truth First (I), Evidence-Based Findings (III), Agent Safety
by Default (V), No Hidden Mutation (VI), and No Secrets (VII). Complexity or any deviation
MUST be justified in writing against the principle it strains. Use `CLAUDE.md` for runtime
development guidance; it MUST remain consistent with this constitution.

**Version**: 1.1.0 | **Ratified**: 2026-06-18 | **Last Amended**: 2026-06-21

> Amendment 1.1.0 (2026-06-21, owner-approved): MVP declared shipped/dogfooding and the
> Fortify-then-Expand roadmap approved; a report-only GitHub App moved from MVP MUST-NOT
> to an approved post-MVP surface (P4 only). MINOR bump — adds an approved surface; no
> principle removed or redefined. Mutation, statelessness, and secret rules unchanged.
> Propagated to: CLAUDE.md (Current Phase), specs/014-github-app-report-only/plan.md
> (governance gate cleared). Templates unaffected (no principle meaning changed).
