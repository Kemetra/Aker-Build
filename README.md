# Aker Build

[![CI](https://github.com/Kemetra/Aker-Build/actions/workflows/aker-build.yml/badge.svg?branch=main)](https://github.com/Kemetra/Aker-Build/actions/workflows/aker-build.yml) [![License: MIT](https://img.shields.io/github/license/Kemetra/Aker-Build)](LICENSE)

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

Aker Build's MVP CLI chain and FORTIFY phases are implemented. The repository now builds and verifies a single-package `aker-build@0.1.0` tarball and provides an approval-protected release workflow. The first npm publication remains an explicit owner operation.

- Aker Build runs against its own repo through a report-only GitHub Action.
- A self-hostable, single-tenant report-only GitHub App runtime is implemented and tested locally; credentialed field verification remains an operator-run smoke step.
- Public npm availability is pending the owner-run first publish; the hosted dashboard/org view, blocking enforcement, auto-fix, auto-commit, and auto-merge remain deferred.

## Benchmark scorecard

![benchmark](https://img.shields.io/badge/G4_confirmed_precision-100%25-brightgreen)
![benchmark](https://img.shields.io/badge/G4_suspected_recall-100%25-brightgreen)

Aker Build's detection quality is measured, not asserted — **including where it
fails**. A labeled corpus of synthetic multi-tenant failure cases
(`benchmark/cases/`, 19 cases) runs through the real `scan → gates` pipeline;
precision and recall are computed per gate × confidence tier, and CI fails if
they drop below `benchmark/thresholds.json`.

Every number below is reproducible with one command, against a corpus that ships
in this repository.

| Gate | Tier | Precision | Recall | TP | FP | FN |
|---|---|---|---|---|---|---|
| TG-G3 Migration Safety | confirmed | 100% | 100% | 1 | 0 | 0 |
| TG-G3 Migration Safety | suspected | 100% | 100% | 1 | 0 | 0 |
| TG-G4 Tenant Isolation | confirmed | 100% | 100% | 2 | 0 | 0 |
| TG-G4 Tenant Isolation | suspected | 100% | 100% | 4 | 0 | 0 |
| TG-G5 Idempotency | suspected | 100% | 100% | 2 | 0 | 0 |

Absolute counts are shown because percentages over small denominators mislead:
these rates rest on 10 true positives in total. Treat the corpus as a regression
harness that is still growing, not as a population estimate.

### What the corpus proves

A scorecard reading 100% is only meaningful if the corpus contains cases the
engine can fail. Four of these cases exist specifically to break it, and two of
them did:

- **Window bleed** (`window-bleed-false-negative`) — an unscoped query with a
  *neighbouring* statement's tenant token nearby. The detector's line window used
  to treat that token as scoping the query, a **false negative in the
  tenant-isolation gate**. Now the window is bounded by the query's own bracket
  depth, so it ends where the statement ends.
- **Model-first ORM calls** (`model-first-orm`) — Mongoose-style
  `User.findOne(`. Query detection gated on a database-handle allow-list
  (`db`, `prisma`, `knex`, …), so these were never seen at all. Now PascalCase
  receivers are recognised as models.
- **Multi-line scoping** (`multiline-tenant-scope`), **array methods**
  (`bare-array-method`) and **PascalCase non-models** (`pascal-case-non-model`)
  pin the opposite failures — a `where: { tenantId }` on the line below the call
  must still count as scoped; `users.find(...)` must still be ignored as an array
  method; and `Array.find(`, `Registry.find(`, `Cache.find(` must not be mistaken
  for ORM models just because they are capitalised.

Both fixes remain heuristics rather than parsing: window-based classifications
are emitted at `medium` confidence, which maps to the `suspected` tier — the
honest-uncertainty channel that advises and never blocks. Every finding carries
an evidence span (`file:line`) and a confidence tier.

Known remaining limitations, all deliberate: detection is regex-based, not
parsed, so ORM idioms outside the handle allow-list and the PascalCase convention
(e.g. a lowercase repository object with an unlisted name) go unseen; and the
statement window counts brackets inside string literals, so an unbalanced closer
in a SQL string could end a window early. The `coverage` field below is how the
first shows up honestly rather than silently; the second is why window-based
findings stay in `suspected`.

### Coverage

The scanner partitions the frameworks and data-access libraries it detects into
those its detectors understand and those they do not
(`project-map.coverage.covered` / `.uncovered`), so "no findings" always reads as
"no findings **in covered frameworks**". An unrecognised stack produces silence,
and silence is not safety.

Covered today: `express`, `prisma`, `mongoose`, `knex`, `sequelize`, `typeorm`,
`drizzle`. Detected but **not** understood — and reported as such: `nextjs`
(route handlers are `export async function GET`), `nestjs` (decorator-based),
`fastify` (hook-based), and UI frameworks. A scan of an `express` + `prisma` +
`next` repo reports `covered: [express, prisma]`, `uncovered: [nextjs]`.

Aker Build analyses TypeScript **application-layer** query code. For
database-layer RLS analysis it complements, rather than replaces, tools such as
[pgrls](https://github.com/pgrls/pgrls).

Regenerate: `pnpm dlx tsx packages/eval/src/bin.ts` (writes `.aker-build/benchmark-report.{json,md}`).

## Quickstart

From a fresh checkout:

```bash
pnpm install
pwsh -File scripts/smoke-first-run.ps1
```

The smoke script copies `examples/multi-tenant-saas-basic` into a temporary git repo, runs the MVP CLI chain, creates a controlled local diff, and verifies the expected outputs.

Run the complete read-only advisory chain from source:

```bash
pnpm dlx tsx packages/cli/src/bin.ts check <repo> --out <out-dir>
```

To build and smoke the exact package that is ready for publication:

```bash
pnpm test:cli-package
node scripts/verify-cli-package.mjs --tarball-dir release
```

After the owner completes the first public release, the canonical activation path is:

```bash
npx aker-build check .
```

The standalone source commands remain available when a specific stage is needed:

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
aker-build check [path]
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

`check` composes `scan → gates → queue → route → report` and promotes its six-file output only after every stage succeeds. It does not generate prompts, review diffs, execute agents, or mutate the analyzed source.

## Documentation

- First-run demo: `docs/demo/first-run.md`
- npm release runbook: `docs/release/npm.md`
- Post-foundation plan: `docs/roadmap/post-foundation-technical-plan.md`
- One-command distribution: `specs/017-one-command-distribution/spec.md`
- GitHub App server: `packages/github-app-server/README.md`
- Contributor guide: `CONTRIBUTING.md`
