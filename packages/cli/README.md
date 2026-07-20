# @aker-build/cli

The `aker-build` command-line interface (Commander). Current commands are `check`, `scan`, `map`, `gates`, `queue`, `route`, `prompt`, `review-pr`, and `report`.

Scanner spec: [`specs/003-cli-scanner`](../../specs/003-cli-scanner/spec.md) ·
Gates spec: [`specs/004-saas-gates-v0`](../../specs/004-saas-gates-v0/spec.md) ·
Queue/router spec: [`specs/005-derived-queue-router`](../../specs/005-derived-queue-router/spec.md) ·
Prompt spec: [`specs/006-agent-prompt-compiler`](../../specs/006-agent-prompt-compiler/spec.md) ·
Review spec: [`specs/007-pr-reviewer`](../../specs/007-pr-reviewer/spec.md)

Run the CLI from source during development:

```bash
pnpm dlx tsx packages/cli/src/bin.ts --help
```

Build or fully verify the zero-dependency npm artifact:

```bash
pnpm build:cli-package
pnpm test:cli-package
```

The executable is generated at `packages/cli/dist/npm/dist/aker-build.js`. Public `npx aker-build ...` usage begins only after the owner completes the first npm publish.

## Commands

```bash
# Run scan → gates → queue → route → report atomically
aker-build check [path] [--config <path>] [--out <dir>]

# Scan a repo (read-only) and write .aker-build/project-map.json
aker-build scan [path] [--config <path>] [--out <dir>] [--stdout] [--format json|yaml]

# Show / re-emit the produced map
aker-build map [--out <dir>] [--format json|yaml]

# Run SaaS gates and write risks.json
aker-build gates [path] [--gates <ids>] [--config <path>] [--out <dir>] [--stdout] [--format json|yaml]

# Derive queue.json from project-map.json + risks.json
aker-build queue [path] [--out <dir>] [--stdout] [--format json|yaml]

# Select one next-safest task and write route.json
aker-build route [path] [--out <dir>] [--stdout] [--format json|yaml]

# Compile a safe agent prompt for a queue item
aker-build prompt <id> [--agent claude|codex|generic] [--out <dir>] [--stdout]

# Review a local diff or GitHub PR
aker-build review-pr [path] --local-diff [--item <id>] [--config <path>] [--out <dir>] [--stdout] [--format json|yaml]
aker-build review-pr <number> [--item <id>] [--config <path>] [--out <dir>] [--stdout] [--format json|yaml]

# Summarize produced artifacts
aker-build report [path] [--out <dir>] [--stdout] [--format json|yaml|md]
```

Successful `check` output contains exactly these owned artifacts:

```text
project-map.json
risks.json
queue.json
route.json
aker-build-report.json
aker-build-report.md
```

The files are staged separately and promoted as one complete transaction. A failed stage preserves the prior complete set and leaves unrelated files in the output directory untouched.

## Exit codes

- `check`: `0` complete artifact set produced · `1` missing prerequisite/not a Git repo · `2` bad input/config · `3` internal or artifact-integrity error. Findings alone do not make `check` fail.
- `scan`: `0` map produced & valid · `1` not a Git repo · `2` internal error (assembled map invalid).
- `map`: `0` map shown · `1` no produced map (run `scan` first).
- `gates`: `0` risks produced & valid · `1` no project map · `2` bad input · `3` internal error.
- `queue`: `0` queue produced & valid · `1` missing project map or risks · `2` not a Git repo · `3` internal error.
- `route`: `0` decision produced · `1` missing queue · `2` not a Git repo · `3` internal error.
- `prompt`: `0` prompt compiled · `1` missing queue · `2` bad input or scope refusal · `3` internal error.
- `review-pr`: `0` review completed · `1` missing upstream input · `2` bad input or unavailable git/gh · `3` internal error.
- `report`: `0` report produced · `2` invalid input artifact · `3` internal error.

## Guarantees

The CLI is local-first and read-only on scanned/reviewed source. It does not execute AI agents, commit, push, open PRs, auto-fix, auto-merge, or require GitHub credentials for `--local-diff`.

Outputs are validated by their owning packages where schemas exist, and findings carry file/line/missing-artifact evidence. Secret-like content is flagged without copying the value into reports.

## Develop

```bash
pnpm test
pnpm typecheck
```
