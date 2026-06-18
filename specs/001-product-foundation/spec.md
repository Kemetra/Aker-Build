# Feature Specification: Product Foundation

**Feature Branch**: `001-product-foundation`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "Create the first product foundation specification for TenantGuard — a CLI-first SaaS Build Kernel — defining purpose, users, pains, MVP scope, non-goals, core workflow, CLI commands, outputs, Spec Kit relationship, principles, acceptance criteria, and follow-up specs. Docs only."

---

## Product Purpose *(mandatory)*

TenantGuard is a CLI-first **SaaS Build Kernel**: a control plane that helps teams build and
maintain multi-tenant SaaS systems with GitHub, specs, CI, and AI coding agents — without losing
architecture control.

It answers, from current source evidence:

- What is the current source truth?
- What is risky?
- What is blocked?
- What is the next safest task?
- What files may an AI agent touch?
- Is this PR ready to merge?

**One-line positioning**

> Build SaaS with AI agents without losing architecture control.

TenantGuard is **not** a SaaS boilerplate, **not** a generic task manager, and **not** a Retail
Tower product. It is a side product derived through *clean extraction* from Retail Tower OS
operating lessons — it does not copy Retail Tower domain logic, repo-specific rules, ERPNext/POS
details, private roadmap material, or internal reports.

---

## User Scenarios & Testing *(mandatory)*

The "users" are SaaS-building teams; the "system" is the TenantGuard CLI run against a target repo.

### User Story 1 - See the current safe state of a repo (Priority: P1)

A developer points TenantGuard at a SaaS repository and gets an evidence-backed picture of what
exists, what is risky, and what is blocked — derived from the actual repo, not from stale notes.

**Why this priority**: Source truth is the foundation of every other capability. Without a trusted
project map and risk list, routing and prompts are guesswork. This story alone delivers value (a
risk report) and is the minimum viable slice.

**Independent Test**: Run the scan/report flow against a sample repo and confirm it produces a
project map and a risk list where every finding cites concrete evidence (file path, changed file,
missing artifact, or failed command).

**Acceptance Scenarios**:

1. **Given** a local SaaS repo, **When** the user runs the scan, **Then** TenantGuard produces a
   project map describing detected structure without modifying any repo file.
2. **Given** a scanned repo, **When** the user requests a report, **Then** each risk lists at least
   one piece of concrete evidence and no status is asserted without evidence.
3. **Given** missing or unverifiable evidence, **When** a status is reported, **Then** it is marked
   "needs verification" rather than asserted as fact.

---

### User Story 2 - Get the next safest task (Priority: P2)

A team lead asks TenantGuard "what should we do next?" and receives exactly one next-safest task,
selected from a derived queue, with the reason it was chosen and what is blocked.

**Why this priority**: Teams frequently do not know the safe next step. A single, justified
recommendation reduces wasted and risky work. Depends on P1 (needs the map + risks first).

**Independent Test**: From a scanned repo with known risks, run the queue + route flow and confirm
it returns one next task plus a list of blocked items, each with a stated reason.

**Acceptance Scenarios**:

1. **Given** a derived queue, **When** the user routes, **Then** exactly one next-safest task is
   returned by default, with an explicit reason.
2. **Given** an item with unmet dependencies or a failing gate, **When** routing runs, **Then** that
   item appears as blocked with the blocking reason.

---

### User Story 3 - Hand a safe, scoped task to an AI agent (Priority: P3)

A developer compiles a copy-paste-ready prompt for an AI coding agent (e.g. Claude or Codex) that is
narrow, scope-limited, and safe by default.

**Why this priority**: Unscoped agent prompts are the main cause of agents changing too many files.
A safe prompt converts a routed task into controlled execution. Depends on P2 (needs a routed task).

**Independent Test**: For a routed task, generate a prompt and confirm it contains all required
safety sections and names allowed/forbidden files explicitly.

**Acceptance Scenarios**:

1. **Given** a routed task, **When** the user compiles a prompt, **Then** the prompt includes
   objective, repo-state verification, context, scope, allowed files, forbidden files, validation
   commands, git rules, stop conditions, and final-report format.
2. **Given** a generated prompt, **When** it is inspected, **Then** it contains no secrets and does
   not instruct the agent to commit, push, or merge.

---

### User Story 4 - Check whether a change is ready (Priority: P3)

A reviewer runs TenantGuard against a local diff (or, later, a GitHub PR) and gets a
Ready / Not Ready / Needs Verification verdict against declared scope and gates, with evidence.

**Why this priority**: Closes the loop — verifying agent or human output against the same gates that
shaped the task. Local-diff review works without GitHub credentials, keeping the kernel local-first.

**Independent Test**: Run the local-diff review on a repo with a deliberate boundary violation and
confirm it returns "Not Ready" citing the violated gate and the evidence.

**Acceptance Scenarios**:

1. **Given** a local diff, **When** the user runs review, **Then** TenantGuard returns one of
   Ready / Not Ready / Needs Verification with supporting evidence.
2. **Given** a diff that violates an architecture or security gate, **When** review runs, **Then**
   the verdict is Not Ready and names the failing gate.

---

### Edge Cases

- **Empty / non-SaaS repo**: scanning a repo with no detectable SaaS structure produces an empty or
  minimal project map and a clear "insufficient evidence" note — never a fabricated structure.
- **No queue items ready**: routing when every item is blocked returns "no safe next task" plus the
  blocking reasons, not an arbitrary pick.
- **Secret-like content in source**: encountered secrets are flagged as findings and never echoed
  into any report, prompt, or output.
- **Spec Kit absent**: a repo with plain docs or no specs is still scannable; absence of Spec Kit
  artifacts degrades gracefully, it does not error out.
- **No GitHub access**: all core flows (scan, map, gates, queue, route, prompt, local-diff review)
  run with no network and no credentials.

---

## Core Workflow *(mandatory)*

TenantGuard's operating flow:

```text
scan sources
→ build project map
→ run gates
→ derive queue
→ route next safest task
→ compile agent prompt
→ review result / PR
```

Each stage consumes the prior stage's evidence-backed output. No stage asserts status it cannot
support with evidence from the repo, diff, PR metadata, or CI.

---

## Requirements *(mandatory)*

### Functional Requirements

**Scope & truth**

- **FR-001**: The system MUST scan a local repository and produce a project map of detected
  structure without modifying any repository file.
- **FR-002**: The system MUST run SaaS gates (v0) over the repository and produce a risk list.
- **FR-003**: The system MUST attach concrete evidence (file path, line where available, changed
  file, missing artifact, failed command, or PR metadata) to every risk and finding.
- **FR-004**: The system MUST report "needs verification" for any status it cannot confirm from
  evidence, and MUST NOT assert unverified status as fact.

**Queue & routing**

- **FR-005**: The system MUST derive an execution queue from evidence rather than from manual todo
  lists.
- **FR-006**: The system MUST select exactly one next-safest task by default, with an explicit
  reason, and MUST list blocked items with their blocking reasons.

**Agent safety**

- **FR-007**: The system MUST compile AI-agent prompts that include objective, repo-state
  verification, context, scope, allowed files, forbidden files, validation commands, git rules,
  stop conditions, and final-report format.
- **FR-008**: Generated prompts MUST be narrow and scope-limited by default.

**Review**

- **FR-009**: The system MUST review a local diff and return a Ready / Not Ready / Needs
  Verification verdict with supporting evidence.

**Outputs**

- **FR-010**: The system MUST emit machine-readable outputs (a project map, a risk list, a queue)
  and human-readable reports.

**Safety & boundaries**

- **FR-011**: The system MUST NOT store, print, transmit, or embed secrets or credentials in any
  output, report, prompt, map, or log; secret-like content MUST be flagged, never surfaced.
- **FR-012**: The system MUST NOT commit, push, open pull requests, merge, auto-fix, or execute AI
  agents in the MVP. Any mutating capability is a later, separately approved feature.
- **FR-013**: The system MUST run all core flows locally without network access or credentials.
- **FR-014**: The system MUST read Spec Kit artifacts when present, and MUST continue to function on
  repositories that have plain docs or no formal specs (Spec-compatible, not Spec-Kit-dependent).
- **FR-015**: The system MUST NOT include Retail Tower domain logic, ERPNext/POS-specific rules, or
  any private project material.

### Required MVP CLI Commands

The MVP CLI MUST provide (names are product surface, not implementation detail):

```text
tenantguard init
tenantguard scan
tenantguard map
tenantguard gates
tenantguard queue
tenantguard route
tenantguard prompt <ID> --agent claude
tenantguard prompt <ID> --agent codex
tenantguard review-pr --local-diff
tenantguard report
```

### Required MVP Outputs

```text
project-map.json        machine-readable project map
risks.json              evidence-backed risk list
queue.json              derived execution queue
one next safe action    selected by the router, with reason
safe agent prompt       copy-paste-ready, scope-limited
PR / readiness report   Ready / Not Ready / Needs Verification
tenantguard-report.md   human-readable report
tenantguard-report.json machine-readable report
```

### Key Entities

- **Project Map**: a versioned, evidence-derived description of the target repo (detected stack,
  repos/areas, boundaries, tenant model, critical surfaces). Schema defined in `002-project-map-schema`.
- **Risk / Finding**: a single evidence-backed issue tied to a gate, with severity and location.
- **Queue Item**: a safe, scoped unit of work (status, type, evidence, dependencies, lock scope,
  allowed/forbidden files, gates, validation, stop conditions, final-report requirements).
- **Gate**: a named check (TG-G0…TG-G9) that a repo, task, or change must satisfy.
- **Agent Prompt**: a compiled, scope-limited instruction set safe to hand to an AI coding agent.
- **Review Verdict**: Ready / Not Ready / Needs Verification, with evidence, for a diff or PR.

---

## MVP Scope *(mandatory)*

In scope for MVP:

```text
1. Scan a local repo.
2. Detect basic project structure.
3. Produce project-map.json.
4. Run SaaS gates v0 and produce risks.json.
5. Derive queue.json.
6. Select one next safest task.
7. Generate Claude/Codex-safe prompts.
8. Review local diffs.
9. Produce Markdown and JSON reports.
```

---

## Non-Goals *(mandatory)*

Explicitly **not** in MVP:

```text
- Hosted SaaS dashboard
- Billing / subscriptions
- GitHub App
- Direct AI-agent execution
- Auto-fix
- Auto-commit
- Auto-merge
- Deep support for every language / framework
- OPA / Rego policy engine
- Full static-analysis engine
- Retail Tower private domain logic
- ERPNext / POS-specific rules
```

---

## Relationship to Spec Kit *(mandatory)*

- TenantGuard **uses** Spec Kit for its own build workflow (constitution → specify → plan → tasks →
  reviewed implementation).
- As a **product**, TenantGuard **supports** Spec Kit projects: it reads `.specify/` artifacts
  (constitution, spec, plan, tasks, checklists) when present and maps them into its project map,
  queue, gates, and prompt context.
- TenantGuard **must not depend on Spec Kit to function**. Repos with plain docs or no specs are
  fully supported; absence of Spec Kit degrades gracefully.

---

## Product Principles *(mandatory)*

These derive from the ratified constitution (`.specify/memory/constitution.md`, v1.0.0) and govern
this feature:

- **Source truth first** — inspect current evidence before claiming status, readiness, or blockers.
- **Evidence-based gates** — every risk, gate result, and recommendation carries concrete evidence.
- **Safe AI-agent boundaries** — prompts are scoped, with allowed/forbidden files and stop conditions.
- **Local-first CLI** — core value runs locally, without network or credentials.
- **GitHub-first integration** — GitHub is the primary integration target (Action/App come later),
  but is never required for local core flows.
- **No secrets** — never store, print, transmit, or embed secrets in any artifact.
- **No auto-commit / auto-merge** — the tool observes, reports, and recommends; it never mutates
  repo or GitHub state in MVP.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can run `scan → queue → route → prompt → review-pr --local-diff` against a
  sample repo and receive a project map, a risk list, a derived queue, one next safe action, a safe
  agent prompt, and a PR/readiness report.
- **SC-002**: 100% of reported risks and findings cite at least one concrete piece of evidence; zero
  findings are evidence-free.
- **SC-003**: 100% of generated agent prompts contain all required safety sections (objective,
  repo-state verification, context, scope, allowed files, forbidden files, validation, git rules,
  stop conditions, final-report format).
- **SC-004**: 0 secrets appear in any generated output, report, prompt, map, or log.
- **SC-005**: All MVP core flows complete with no network access and no credentials configured.
- **SC-006**: The router returns exactly one next-safest task by default (or an explicit "no safe
  task" with reasons), never an unexplained pick.
- **SC-007**: TenantGuard runs successfully on a repo containing Spec Kit artifacts and on a repo
  with none, without erroring on the absence of specs.

---

## Acceptance Criteria for This Foundation Feature *(mandatory)*

This foundation feature is accepted when:

- **AC-001**: Product direction (purpose, positioning, clean-extraction stance) is stated and
  unambiguous.
- **AC-002**: Target users and their main pains are explicitly listed.
- **AC-003**: MVP scope is enumerated and each item is testable.
- **AC-004**: All non-goals are explicit.
- **AC-005**: The core workflow, required MVP CLI commands, and required MVP outputs are defined.
- **AC-006**: The Spec Kit relationship (support, but not depend on) is explicit.
- **AC-007**: The seven product principles are stated and traceable to the constitution.
- **AC-008**: Follow-up feature specs are listed in dependency order, and none are implemented here.
- **AC-009**: The spec is implementation-neutral — it states product constraints, not a tech stack,
  internal module design, or code structure.
- **AC-010**: No production code, `package.json`, lockfile, GitHub Action, dashboard, or GitHub App
  is created by this feature.

---

## Target Users *(mandatory)*

1. Founders and indie hackers building SaaS with AI coding agents.
2. Small engineering teams using GitHub PRs and AI-assisted development.
3. Agencies building multi-tenant products for clients.
4. SaaS teams with stale docs, unclear boundaries, and risky migrations.

---

## Main User Pains *(mandatory)*

```text
- AI agents change too many files.
- Teams do not know the next safe task.
- Docs / specs drift from code.
- PRs pass tests but break architecture boundaries.
- Tenant isolation is not consistently verified.
- Migrations are risky or undocumented.
- Background jobs lack idempotency.
- API contracts change without consumer updates.
- CI is present but does not enforce product-specific gates.
```

---

## Follow-up Feature Specs *(mandatory)*

Listed in dependency order — **defined here, not implemented by this feature**:

```text
002-project-map-schema      Versioned Project Map schema + required JSON/YAML outputs.
003-cli-scanner             Local repo scanning and project-map output.
004-saas-gates-v0           Initial SaaS gate checks with evidence-based findings.
005-derived-queue-router    Queue derivation and next-safest-task selection.
006-agent-prompt-compiler   Safe prompts for Claude, Codex, and generic agents.
007-pr-reviewer             Local-diff and GitHub PR review against scope and gates.
008-github-action           Run TenantGuard in CI and produce PR summaries.
```

Dependency note: do not implement `003-cli-scanner` before `002-project-map-schema` exists.

**Roadmap status (binding)**: `001-product-foundation` and `002-project-map-schema` are the active
foundation contracts. **`003`–`008` are DRAFT ROADMAP specs** — defined here for direction and
dependency ordering, **not** approved as implementation-ready. None of `003`–`008` may proceed to
`plan.md`, `tasks.md`, or any production code until that individual spec has been reviewed and
explicitly approved. A `**Status**: Draft` line on those specs means "drafted for the roadmap," not
"ready to build."

**`008-github-action` is a FUTURE CI surface.** It MUST NOT be planned or implemented until the
local CLI scanner (`003`), the SaaS gates (`004`), and the PR reviewer (`007`) are implemented and
reviewed. The GitHub Action only wraps already-built, already-reviewed local capabilities in CI; it
introduces no new core logic and is never a prerequisite for core value (per Constitution II, CLI
First). GitHub App and hosted dashboard remain deferred waves beyond `008`.

---

## Assumptions

- **Tech stack is deferred to plan/ADR layer.** This spec is deliberately implementation-neutral;
  the language, runtime, package manager, and test framework are decided in `plan.md` and the tech
  ADR, not here. (The blueprint proposes TypeScript/Node/pnpm/Vitest/Zod as the likely baseline.)
- **CLI command names** shown are product surface and may be refined during planning; their
  *behaviors* are the binding requirement.
- **Target repos** are Git repositories; non-Git directories are out of MVP scope.
- **GitHub** is the first-class remote platform for later integration; other forges are out of MVP
  scope.
- **"SaaS gates v0"** are the named TG-G0…TG-G9 gates from the constitution; their detailed check
  definitions are specified in `004-saas-gates-v0`.
- **Sample/example repo** for demos and tests is provided by a later spec (`010-example-project` in
  the blueprint), not this feature.
