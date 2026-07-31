# aker-build

**Build SaaS with AI agents without losing architecture control.**

Aker Build scans a repository, runs SaaS gates over what it finds, derives a queue, and
routes the one next-safest task — along with the exact files that task may touch. It
reports; it never mutates your code, commits, merges, or executes an agent.

> The package is **`aker-build`**; the command it installs is **`aker`**.

```bash
pip install aker-build
aker check .
```

## Requirements

**Node.js 22.13 or newer must be on your PATH.**

This wheel carries the compiled JavaScript engine — there is no separate download — but it
does **not** bundle a Node runtime. Install it from [nodejs.org](https://nodejs.org). If
Node is missing or too old, `aker` says so in one sentence and exits non-zero; it never
prints a traceback for a prerequisite you can fix.

Python 3.9+. The wheel is pure-Python and platform-independent: there is nothing to
compile, and no Python dependencies are added to your environment.

### Why a Python package wraps a JavaScript engine

The engine is TypeScript and stays the single source of truth; nothing is reimplemented
here. This package exists so Python-first toolchains can install the CLI through the
dependency path they already use. The launcher locates Node, checks the version floor,
executes the bundled engine, and forwards your arguments and its exit code verbatim.

The same version is published on
[npm](https://www.npmjs.com/package/aker-build) — both channels read one version constant,
so `pip` and `npm` cannot diverge.

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

The set is written as one transaction. A failed stage preserves the previous complete set.

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
change. `confirmed` findings can drive action; `suspected` findings advise and never block.

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
aker report [path]             # summarize produced artifacts (--format json|yaml|md)
```

Common flags: `--config <path>`, `--out <dir>`, `--stdout`, `--format json|yaml`.

Exit codes: `0` completed · `1` missing prerequisite or not a Git repository · `2` bad
input/config or refused scope · `3` internal error. Findings alone never fail a command.

## What it will not do

Local-first and read-only on the source it scans. It does not execute AI agents, commit,
push, open pull requests, auto-fix, auto-merge, or require GitHub credentials for
`--local-diff`. Secret-like content is flagged without copying the value into any report.

## Honest limitations

Detection is **regex-based, not parsed**. ORM idioms outside the recognised
database-handle allow-list and the PascalCase-model convention go unseen, and window-based
classifications stay in the `suspected` tier on purpose.

The scanner reports what it *does* understand — `project-map.coverage.covered` and
`.uncovered` — so "no findings" always reads as "no findings **in covered frameworks**".
Covered today: `express`, `prisma`, `mongoose`, `knex`, `sequelize`, `typeorm`, `drizzle`.
Detected but not understood, and reported as such: `nextjs`, `nestjs`, `fastify`, and UI
frameworks. An unrecognised stack produces silence, and silence is not safety.

Aker Build analyses TypeScript **application-layer** query code. For database-layer RLS
analysis it complements, rather than replaces, tools such as
[pgrls](https://github.com/pgrls/pgrls).

Detection quality is measured against a labeled corpus that ships in the repository (19
cases) and gated in CI. The
[scorecard](https://github.com/Kemetra/Aker-Build#benchmark-scorecard) reports absolute
counts next to percentages, because those rates rest on 10 true positives.

## Links

- [Source and documentation](https://github.com/Kemetra/Aker-Build)
- [Issues](https://github.com/Kemetra/Aker-Build/issues)
- [Changelog / releases](https://github.com/Kemetra/Aker-Build/releases)

MIT licensed.
