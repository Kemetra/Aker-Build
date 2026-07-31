# aker-build

**Build SaaS with AI agents without losing architecture control.**

Aker Build scans a repository, runs SaaS gates over what it finds, derives a queue, and
routes the one next-safest task — along with the exact files that task may touch. It
reports; it never mutates your code, commits, merges, or executes an agent.

> The package is **`aker-build`**; the command it installs is **`aker`**.

```bash
npx --package aker-build aker check .
```

Or install it: `npm i -g aker-build` → `aker check .`

Also on PyPI for Python-first toolchains: `pip install aker-build`
([details](https://pypi.org/project/aker-build/)). Both channels ship the same compiled
engine and the same version.

## Requirements

Node.js **22.13+**. Aker Build analyses TypeScript application-layer code in a Git
repository. Scanning a non-Git directory is out of scope and exits non-zero.

## What one pass produces

```text
.aker-build/
├── project-map.json         what is in the repo, and what the scanner understands
├── risks.json               gate findings, each with file:line evidence + confidence
├── queue.json               derived work items
├── route.json               the one next-safest task, with the reason it won
├── aker-build-report.json
└── aker-build-report.md
```

The set is written as one transaction. A failed stage preserves the previous complete set
and leaves unrelated files in the output directory untouched.

## Routing, which is the point

```console
$ aker route . --stdout --format json
{
  "next": {
    "id": "Q-002",
    "title": "Fix: API route without an auth guard",
    "reason": [
      "highest score (0.86)",
      "status=ready",
      "tier=confirmed",
      "validation available"
    ]
  },
  "blocked": [
    { "id": "Q-001", "reason": "insufficient evidence to scope a safe action (needs verification)" }
  ]
}
```

Items are *blocked* rather than guessed at when evidence is too thin to scope a safe
change. Findings carry a confidence tier: `confirmed` findings can drive action,
`suspected` findings advise and never block.

## Scope your scan before the first real run

Detectors read code that *looks* like a vulnerability, and a security-adjacent test suite
is full of deliberately-unsafe examples. On Aker Build's own repository, **76% of findings
land in its own test fixtures** — each locally correct, most not useful. Create
`aker-build.config.json` at your repo root:

```json
{
  "version": 1,
  "paths": {
    "exclude": ["**/tests/**", "**/*.test.ts", "fixtures/**", "examples/**"]
  }
}
```

## Commands

```bash
aker check [path]              # scan → gates → queue → route → report, one read-only pass
aker scan [path]               # produce project-map.json
aker map                       # show / re-emit the produced map
aker gates [path]              # run the gate set (or --gates <ids>), produce risks.json
aker queue [path]              # derive queue.json
aker route [path]              # select one next-safest task + list blocked items
aker prompt <id>               # compile a scoped agent prompt (--agent claude|codex|generic)
aker review-pr [path] --local-diff   # review a local diff → Ready / Not Ready / Needs Verification
aker review-pr <pr-number>     # or review a GitHub PR
aker report [path]             # summarize produced artifacts (--format json|yaml|md)
```

Common flags: `--config <path>`, `--out <dir>`, `--stdout`, `--format json|yaml`.

### Gates

```text
TG-G0 Source Truth     TG-G1 Architecture Boundary   TG-G2 Contract/API
TG-G3 Migration Safety TG-G4 Security/Tenant Isolation TG-G5 Idempotency
TG-G6 Billing/Usage    TG-G7 Observability           TG-G8 Dependency/Upgrade
TG-G9 Release Readiness
```

## Exit codes

Findings alone never fail a command — only errors do.

| Code | Meaning |
|---|---|
| `0` | completed; artifacts produced and valid |
| `1` | missing prerequisite (run `scan` first) or not a Git repository |
| `2` | bad input, bad config, or a refused scope |
| `3` | internal or artifact-integrity error |

## For AI coding agents

An MCP server exposes the control plane read-only, so an agent can ask for the next task
and a scoped prompt without being handed the whole repository. See
[the MCP docs](https://github.com/Kemetra/Aker-Build#for-ai-coding-agents-mcp).

## What it will not do

Local-first and read-only on the source it scans. It does not execute AI agents, commit,
push, open pull requests, auto-fix, auto-merge, or require GitHub credentials for
`--local-diff`. Secret-like content is flagged without copying the value into any report.

## Honest limitations

Detection is **regex-based, not parsed**. ORM idioms outside the recognised
database-handle allow-list and the PascalCase-model convention go unseen, and window-based
classifications stay in the `suspected` tier on purpose.

The scanner therefore reports what it *does* understand: `project-map.coverage.covered`
and `.uncovered`, so "no findings" always reads as "no findings **in covered
frameworks**". Covered today: `express`, `prisma`, `mongoose`, `knex`, `sequelize`,
`typeorm`, `drizzle`. Detected but not understood, and reported as such: `nextjs`,
`nestjs`, `fastify`, and UI frameworks. An unrecognised stack produces silence, and
silence is not safety.

Detection quality is measured against a labeled corpus that ships in the repository (19
cases) and gated in CI — including the cases that exist specifically to break it. The
[scorecard](https://github.com/Kemetra/Aker-Build#benchmark-scorecard) reports absolute
counts next to percentages, because those rates rest on 10 true positives.

For database-layer RLS analysis, Aker Build complements rather than replaces tools such as
[pgrls](https://github.com/pgrls/pgrls).

## Links

- [Source and documentation](https://github.com/Kemetra/Aker-Build)
- [Issues](https://github.com/Kemetra/Aker-Build/issues)
- [Changelog / releases](https://github.com/Kemetra/Aker-Build/releases)

MIT licensed.
