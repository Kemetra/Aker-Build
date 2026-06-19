# TenantGuard Post-Foundation Technical Plan

Status: Updated by 010 release-readiness implementation
Date: 2026-06-19
Scope: What to do after foundation + nine specs, before public launch or deferred hosted surfaces.

## Executive technical decision

TenantGuard should now move from feature-completion to release-confidence.

The correct next strategy is not "more big features". It is:

```text
reconcile truth -> prove first-run value -> freeze output contracts -> add safe customization -> package/distribute -> launch readiness
```

This keeps TenantGuard aligned with its own constitution: source truth first, evidence-based findings, agent-safe prompts, no hidden mutation, no secrets, and clean general SaaS extraction.

## Product boundary after foundation

TenantGuard remains:

```text
local CLI -> reports -> scoped prompts -> PR/diff review -> report-only CI
```

TenantGuard does not become yet:

```text
hosted dashboard
GitHub App
auto-fixer
auto-commit bot
policy marketplace
SaaS billing product
```

## Recommended next specs

| Spec | Name | Type | Why now | Exit gate |
|---|---|---|---|---|
| 010 | `release-readiness-and-first-run-demo` | docs + demo + smoke validation | Proves a new user can run the full chain and see value. Unlocks launch readiness. | Cold first-run succeeds from README against example repo. |
| 011 | `spec-kit-adapter-and-config-boundary` | spec + implementation slices | Fulfills the "Spec-compatible, not Spec-Kit-dependent" promise and gives real repos customization without chaos. | Spec artifacts map into project context; config overrides are audited. |
| 012 | `output-contract-and-report-versioning` | spec + tests | Prevents breaking users once reports become public artifacts. | `project-map`, `risks`, `queue`, `route`, `review`, `report` contracts are versioned. |
| 013 | `npm-package-and-release-workflow` | spec + implementation | Needed before public CLI launch. | Package can be installed and run from a clean environment. |
| 014 | `github-action-template` | implementation | Converts dogfood CI into a reusable external Action surface, still report-only. | External repo can run TenantGuard in PR workflow. |
| 015 | `launch-readiness-execution` | docs + community assets | Executes 009 only after demo/distribution are ready. | README, demo, license, contributing, issues, topics are ready. |

## Wave plan

### Wave A — Reconciliation and release boundary

Goal: stop planning from stale docs.

Deliverables:

```text
docs/status/post-foundation-reconciliation.md
docs/roadmap/post-foundation-technical-plan.md
docs/decisions/ADR-008-post-foundation-sequence.md
```

Also update existing docs only where stale:

```text
docs/tenantguard_project_blueprint.md
packages/cli/README.md
specs/009-launch-and-community-strategy/spec.md
CLAUDE.md active feature pointer, if needed
```

Exit criteria:

- Spec numbering is reconciled.
- CLI command docs match `packages/cli/src/index.ts`.
- Active feature pointer does not imply 009 is still an active implementation target.

### Wave B — First-run demo and golden example

Goal: prove the CLI value in minutes.

Deliverables:

```text
examples/multi-tenant-saas-basic/
docs/demo/first-run.md
README quickstart update
.tenantguard expected-output fixtures for tests, if appropriate
smoke test for scan -> gates -> queue -> route -> prompt -> review-pr --local-diff
```

Exit criteria:

- Fresh clone can run the documented demo.
- Demo produces useful `project-map`, `risks`, `queue`, route decision, prompt, and review report.
- Demo contains no secrets or private Retail Tower/ERPNext details.

### Wave C — Output contract and versioning

Goal: prevent report formats from drifting after users adopt the tool.

Deliverables:

```text
docs/decisions/ADR-009-output-contract-versioning.md
contracts/risks.schema.json
contracts/queue.schema.json
contracts/route.schema.json
contracts/review.schema.json
contracts/report.schema.json
contract tests
```

Exit criteria:

- Every public JSON output has a version field.
- Breaking changes require an ADR or explicit migration note.
- Markdown reports are user-facing but JSON is canonical.

### Wave D — Config and Spec Kit adapter

Goal: make TenantGuard useful on real repos without becoming Spec Kit dependent.

Deliverables:

```text
tenantguard.config.json / tenantguard.config.yaml schema
packages/spec-kit-adapter
safe ignore/suppressions model with evidence and expiry
project metadata enrichment from constitution/spec/plan/tasks/checklists
```

Exit criteria:

- TenantGuard can run on a repo with Spec Kit and use those artifacts as evidence.
- TenantGuard can run on a repo without Spec Kit and still produce useful output.
- Suppressions are explicit, audited, and never silent.

### Wave E — Distribution and reusable CI

Goal: make TenantGuard installable and usable outside its own repo.

Deliverables:

```text
LICENSE
CONTRIBUTING.md
npm package metadata
bin entry verification
release workflow, report-only
GitHub Action template or action wrapper, report-only
```

Exit criteria:

- Clean environment can run `tenantguard --version` and the full demo.
- Release workflow does not expose secrets in logs.
- GitHub Action does not mutate PRs, commit, push, or auto-merge.

### Wave F — Launch readiness execution

Goal: execute 009 only after the product can withstand attention.

Deliverables:

```text
README polish
terminal GIF or screenshot
quickstart proof
good first issues
GitHub topics
launch copy drafts
success metric tracking notes
```

Exit criteria:

- 009 pre-launch checklist passes.
- First user can activate without maintainer help.
- No vaporware claims.

## Priority order

1. Reconcile docs and decisions.
2. Build first-run demo and example repo.
3. Freeze output contracts.
4. Add config + Spec Kit adapter.
5. Package npm release path.
6. Make GitHub Action reusable.
7. Execute launch readiness.

## Hard non-goals for the next 30 days of work

```text
No hosted dashboard.
No GitHub App.
No auto-fix.
No auto-commit.
No auto-merge.
No paid SaaS/billing.
No Retail Tower private domain rules.
No ERPNext-specific rules.
No broad rewrite.
```

## The single next action

Start with a docs-only PR:

```text
docs(010): reconcile post-foundation status and define release-readiness plan
```

Stop before implementation until `010` spec, plan, and tasks are reviewed.
