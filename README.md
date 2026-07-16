# TenantGuard

TenantGuard is a CLI-first SaaS Build Kernel for teams building multi-tenant SaaS systems with GitHub, specs, CI, and AI coding agents.

It helps teams answer:

- What is the current source truth?
- What is risky?
- What is blocked?
- What is the next safest task?
- What files may an AI agent touch?
- Is this PR ready to merge?

TenantGuard is not a SaaS boilerplate. It does not generate a full app. It controls the build process around architecture, gates, queues, prompts, and verification.

## Status

TenantGuard's MVP CLI chain is implemented and in release-readiness hardening. The current focus is a reliable first-run demo, documented command surface, and launch prerequisites.

- TenantGuard runs against its own repo via a report-only GitHub Action dogfooding workflow.
- GitHub App, hosted dashboard, auto-fix, auto-commit, and auto-merge remain deferred.

## Benchmark scorecard

![benchmark](https://img.shields.io/badge/G4_confirmed_precision-100%25-brightgreen)
![benchmark](https://img.shields.io/badge/G4_confirmed_recall-100%25-brightgreen)

TenantGuard's detection quality is measured, not asserted. A labeled corpus of
synthetic multi-tenant failure cases (`benchmark/cases/`, 15 cases) runs through
the real `scan → gates` pipeline; precision/recall are computed per gate ×
confidence tier, and CI fails if they drop below `benchmark/thresholds.json`.

| Gate | Tier | Precision | Recall |
|---|---|---|---|
| TG-G3 Migration Safety | confirmed | 100% | 100% |
| TG-G3 Migration Safety | suspected | 100% | 100% |
| TG-G4 Tenant Isolation | confirmed | 100% | 100% |
| TG-G4 Tenant Isolation | suspected | 100% | 100% |
| TG-G5 Idempotency | suspected | 100% | 100% |

The `suspected` tier is the honest-uncertainty channel: it carries findings the
engine cannot yet structurally prove (they advise, never block). The
multi-line ORM false positive documented in earlier scorecards is fixed by
W3a's windowed, receiver-gated detector; the corpus pins both behaviors
(`multiline-tenant-scope`, `bare-array-method`) so they cannot regress silently.

Known limitations (deliberate v0 tradeoffs, W3b scope): data-access detection is
receiver-gated to common DB handle names plus raw SQL, so model-first ORM calls
(e.g. Mongoose-style `User.findOne(`) and unlisted receivers are not yet
covered; and the 5-line statement window can classify an unscoped query as
scoped when a neighboring statement's tenant token falls inside the window.
Framework signature packs and a coverage-honesty field close these in W3b.

Regenerate: `pnpm dlx tsx packages/eval/src/bin.ts` (writes `.tenantguard/benchmark-report.{json,md}`).

## Quickstart

From a fresh checkout:

```bash
pnpm install
pwsh -File scripts/smoke-first-run.ps1
```

The smoke script copies `examples/multi-tenant-saas-basic` into a temporary git repo, runs the MVP CLI chain, creates a controlled local diff, and verifies the expected outputs.

Manual command shape while the CLI is still TypeScript-source-first:

```bash
pnpm dlx tsx packages/cli/src/bin.ts scan <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts gates <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts queue <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts route <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts prompt Q-001 --agent claude --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts review-pr <repo> --local-diff --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts report <repo> --out <out-dir>
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

## MVP Commands

```bash
tenantguard scan [path]
tenantguard map
tenantguard gates [path]
tenantguard queue [path]
tenantguard route [path]
tenantguard prompt <id> --agent claude|codex|generic
tenantguard review-pr [path] --local-diff
tenantguard review-pr <number>
tenantguard report [path]
```

The npm-published `tenantguard` binary is a follow-up release task. Until then, local and CI usage runs the TypeScript CLI through `tsx`.

## Documentation

- First-run demo: `docs/demo/first-run.md`
- Post-foundation plan: `docs/roadmap/post-foundation-technical-plan.md`
- Contributor guide: `CONTRIBUTING.md`
