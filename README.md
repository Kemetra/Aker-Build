# Aker Build

[![CI](https://github.com/Kemetra/Aker-Build/actions/workflows/aker-build.yml/badge.svg?branch=main)](https://github.com/Kemetra/Aker-Build/actions/workflows/aker-build.yml) [![License: MIT](https://img.shields.io/github/license/Kemetra/Aker-Build)](LICENSE) [![Sponsor](https://img.shields.io/badge/Sponsor-Kemetra-EA4AAA?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Kemetra)

![Aker Build logo](docs/aker-logo.png)

Aker Build is a CLI-first SaaS Build Kernel for teams building multi-tenant SaaS systems with GitHub, specs, CI, and AI coding agents.

It helps teams answer:

- What is the current source truth?
- What is risky?
- What is blocked?
- What is the next safest task?
- What files may an AI agent touch?
- Is this PR ready to merge?

Aker Build is not a SaaS boilerplate. It does not generate a full app. It controls the build process around architecture, gates, queues, prompts, and verification.

## Status

Aker Build's MVP CLI chain is implemented and in release-readiness hardening. The current focus is a reliable first-run demo, documented command surface, and launch prerequisites.

- Aker Build runs against its own repo via a report-only GitHub Action dogfooding workflow.
- GitHub App, hosted dashboard, auto-fix, auto-commit, and auto-merge remain deferred.

## Benchmark scorecard

![benchmark](https://img.shields.io/badge/G4_confirmed_precision-100%25-brightgreen)
![benchmark](https://img.shields.io/badge/G4_confirmed_recall-100%25-brightgreen)

Aker Build's detection quality is measured, not asserted. A labeled corpus of
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

Regenerate: `pnpm dlx tsx packages/eval/src/bin.ts` (writes `.aker-build/benchmark-report.{json,md}`).

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
aker-build scan [path]
aker-build map
aker-build gates [path]
aker-build queue [path]
aker-build route [path]
aker-build prompt <id> --agent claude|codex|generic
aker-build review-pr [path] --local-diff
aker-build review-pr <number>
aker-build report [path]
```

The npm-published `aker-build` binary is a follow-up release task. Until then, local and CI usage runs the TypeScript CLI through `tsx`.

## Support Aker Build

Aker Build is developed in public. Sponsorship helps fund benchmark expansion,
framework coverage, documentation, contributor support, and the work required to
turn the CLI kernel into a dependable GitHub-native product.

[**Sponsor Aker Build through GitHub Sponsors**](https://github.com/sponsors/Kemetra)

Sponsorship supports development; it does not buy a gate result, suppress a finding,
or change the project's published evidence and safety boundaries.

## Documentation

- First-run demo: `docs/demo/first-run.md`
- Post-foundation plan: `docs/roadmap/post-foundation-technical-plan.md`
- Contributor guide: `CONTRIBUTING.md`
