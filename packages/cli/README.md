# @aker-build/cli

The `aker-build` command-line interface (Commander). Current MVP commands are `scan`, `map`, `gates`, `queue`, `route`, `prompt`, `review-pr`, and `report`.

Scanner spec: [`specs/003-cli-scanner`](../../specs/003-cli-scanner/spec.md) ·
Gates spec: [`specs/004-saas-gates-v0`](../../specs/004-saas-gates-v0/spec.md) ·
Queue/router spec: [`specs/005-derived-queue-router`](../../specs/005-derived-queue-router/spec.md) ·
Prompt spec: [`specs/006-agent-prompt-compiler`](../../specs/006-agent-prompt-compiler/spec.md) ·
Review spec: [`specs/007-pr-reviewer`](../../specs/007-pr-reviewer/spec.md)

Until a built/published binary exists, run the CLI source through `tsx`:

```bash
pnpm dlx tsx packages/cli/src/bin.ts --help
```

## Commands

```bash
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

## Exit codes

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

## Report-only GitHub App

`@aker-build/github-app-server` is the self-hostable report-only GitHub App transport over this same
review engine. It receives pull-request webhooks and writes only Checks runs/annotations; it is not a
CLI subcommand and does not change CLI judgment. See
[`packages/github-app-server/README.md`](../github-app-server/README.md).

## Develop

```bash
pnpm test
pnpm typecheck
```
