# TenantGuard Post-Foundation Reconciliation

Status: Updated by 010 release-readiness implementation
Date: 2026-06-19
Purpose: Record the evidence-backed state after foundation + nine specs, identify stale docs, and define the next safe boundary.

## Evidence snapshot

Verified from GitHub `main` during planning:

- `README.md` positions TenantGuard as a CLI-first SaaS Build Kernel and states the core flow: scan sources -> project map -> gates -> queue -> route -> prompt -> review.
- `README.md` status says the MVP CLI is implemented and dogfooding has landed; GitHub App and hosted dashboard remain deferred.
- `CLAUDE.md` says implementation is allowed only through reviewed spec, plan, and tasks files.
- `CLAUDE.md` says the active phase is MVP implementation / dogfooding.
- `.specify/memory/constitution.md` is ratified v1.0.0 and requires Source Truth First, Evidence-Based Findings, Agent Safety, No Hidden Mutation, No Secrets, and General SaaS Kernel clean extraction.
- `packages/cli/src/index.ts` wires `scan`, `map`, `gates`, `queue`, `route`, `prompt`, and `review-pr`.
- Recent PR history shows specs/features 003 through 009 and dogfood/status updates were merged.

## Current state classification

| Area | Classification | Reason |
|---|---|---|
| Product foundation | Implemented / accepted | README, blueprint, constitution, ADRs, and 001 exist. |
| MVP CLI chain | Implemented, needs release hardening | CLI commands are wired; release/demo contracts still need hardening. |
| Dogfood CI | Implemented as report-only | Dogfood workflow exists; no auto-fix/auto-merge should be added. |
| Launch strategy | Spec complete but execution pending | 009 defines launch readiness gates; launch must wait for demo/readiness. |
| GitHub App | Deferred | Explicitly out of MVP. |
| Hosted dashboard | Deferred | Explicitly out of MVP. |
| Spec Kit adapter | Planned gap | Blueprint expected a spec adapter, but actual 009 is launch/community. Needs a new spec number. |
| Example project / first-run demo | Planned gap | Required by 009 launch readiness; not the same as launch execution. |
| Output contract stability | Planned gap | Project map has schema work; risks/queue/route/prompt/review/report contracts need a release boundary. |
| Config / presets / ignores | Planned gap | Real repo adoption will need scoped, auditable customization. |
| Distribution | Planned gap | npm/bin/license/release provenance need decisions before public launch. |

## Drift found

### DRIFT-001: Blueprint spec numbering is stale

`docs/tenantguard_project_blueprint.md` lists:

```text
009-spec-kit-adapter
010-example-project
```

But current `main` contains:

```text
009-launch-and-community-strategy
```

Decision: keep 009 as Launch & Community Strategy because it is merged. Move Spec Kit Adapter to 011 and Example/first-run demo to 010.

### DRIFT-002: `packages/cli/README.md` is stale

It only documents `scan` and `map`, while the CLI source wires `gates`, `queue`, `route`, `prompt`, and `review-pr`.

Decision: update package README during the 010 docs/release-readiness slice.

### DRIFT-003: `specs/009-launch-and-community-strategy/spec.md` status says Draft

The spec file says Draft, while PR history shows the feature was merged as completing the foundation-roadmap spec.

Decision: update status wording during 010, without changing requirements.

## Next safe boundary

Do not start GitHub App, dashboard, auto-fix, auto-commit, or policy plugin work.

The next safe work is:

```text
010-release-readiness-and-first-run-demo
```

This slice should be docs + example/demo + smoke validation focused. It should prove that a new user can run the full CLI chain and see value without maintainer help.

## 010 implementation note

The 010 branch now adds:

- README quickstart for the first-run smoke path.
- Full CLI README coverage for implemented commands.
- `examples/multi-tenant-saas-basic/` as a sanitized fixture.
- `docs/demo/first-run.md` as the guided demo.
- `scripts/smoke-first-run.ps1` as smoke validation for scan -> gates -> queue -> route -> prompt -> review.
- `CONTRIBUTING.md` and existing MIT `LICENSE` readiness coverage.

## Gate posture

| Gate | Posture |
|---|---|
| TG-G0 Source Truth | Required before every next task. |
| TG-G1 Boundary | Required; no hosted dashboard/App in 010. |
| TG-G2 Contract/API | Required for output JSON/Markdown contract changes. |
| TG-G3 Migration | N/A; no DB. |
| TG-G4 Security/Tenant Isolation | Required for example repo and no-secrets checks. |
| TG-G5 Idempotency | Required for rerunnable CLI commands and output overwrite policy. |
| TG-G6 Billing/Usage | N/A for MVP; no billing. |
| TG-G7 Observability | Required for report clarity and evidence quality. |
| TG-G8 Dependency/Upgrade | Required before any dependency/package changes. |
| TG-G9 Release Readiness | Required before public launch. |
