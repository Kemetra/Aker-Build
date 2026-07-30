# Command Rename to `aker` Design (Spec 021)

**Date:** 2026-07-30
**Status:** Approved (design); implementation pending plan + tasks review
**Scope:** Rename the user-typed command from `aker-build` to `aker`. Distribution names, internal package scope, and output directory are unchanged.

## Problem

The command reads as noun-noun-verb: `aker-build check .`. That invites parsing
`build` as the subcommand, so a user reasonably wonders whether `aker-build build`
exists. `aker check .` reads as subject-verb-object and is what a person types
dozens of times a day.

Distribution and invocation are separate concerns, and both npm and PyPI model them
as independent fields. The package keeps the searchable, unambiguous name; the
command gets the short, memorable one:

```bash
pip install aker-build   # provides: aker
npm install aker-build   # provides: aker
aker check .
```

This is the `kubernetes-cli` → `kubectl` and `ripgrep` → `rg` pattern.

## Why now

`aker-build@0.1.0` is built and verified but **not published** — `npm view
aker-build` returns 404. There are zero installed users, so renaming the command
breaks nothing. After the first publish, the same change is breaking for everyone
who installed the previous name. This is the last moment the rename is free.

## The three things that share the string `aker-build`

Conflating these is the expensive mistake this spec exists to prevent. Only the
first changes.

| Thing | Example | Count | Action |
|---|---|---|---|
| **The user-typed command** | `bin` declaration; `` `Run `aker-build scan`` `` in error text | ~29 files | **Rename** |
| **The internal package scope** | `@aker-build/queue`, `@aker-build/gates` | 195 refs | **Leave** |
| **The output directory** | `.aker-build/queue.json` | many | **Leave** |

**The scope must not change.** `@aker-build/*` is a package namespace users never
see. Renaming it across 14 workspace packages is precisely the broad refactor
`CLAUDE.md` forbids, and it delivers no user-visible benefit.

**The output directory must not change.** `.aker-build/` is not a command.
Renaming it would orphan every existing artifact directory and every
`.gitignore` entry pointing at one, for no gain.

**The error strings must change.** If the bin becomes `aker` and the text does
not, the tool prints *"Run `aker-build scan` first"* — instructions for a command
that no longer exists. That is a correctness defect, not cosmetics. It is the
reason this rename cannot be limited to the `bin` field.

## What changes

| Group | Files | Change |
|---|---|---|
| Bin declarations | `packages/cli/package.json`, `scripts/build-cli-package.mjs` | `"aker-build":` → `"aker":`; bundle output filename follows |
| User-facing error text | `packages/cli/src/commands/map.ts`, `packages/gates/src/context.ts`, `packages/prompt/src/io.ts`, `packages/queue/src/context.ts` (×2), `packages/queue/src/index.ts`, `packages/review/src/io.ts`, `packages/mcp/src/ensure.ts` (doc comment) | `` `aker-build <verb>` `` → `` `aker <verb>` `` |
| Tests pinning that text | 7 files under `packages/cli/tests/` | Update expected strings |
| Live user docs | `README.md`, `packages/cli/README.md`, `CLAUDE.md` | Command examples |
| Spec 018 plugin surface | 6 wrappers + `SKILL.md` + regenerated `bundle-manifest.json` | Command examples; manifest baseline recommit |
| Eval fixtures | `distribution/evals/aker-build-skill.json`, `grade.test.mjs` | Expected-command assertions |

## What deliberately does not change

**The 59 historical records** in `specs/`, `docs/decisions/`, `docs/roadmap/`, and
`docs/superpowers/`. `specs/003-cli-scanner/spec.md` documenting `aker-build scan`
is a true record of what was specified at that time.

This follows a precedent already set twice in this project: the
`specs/017-.../tasks.md` claim of "all 15 labeled cases" was left alone when the
corpus grew to 19, because rewriting recorded evidence damages the audit trail the
repository is built around. A spec is a point-in-time artifact, not living
documentation.

Consequence to accept knowingly: a reader of an old spec will see a command name
that no longer works. The mitigation is a dated note in `CHANGELOG.md` (Spec 011
task) recording the rename, so the discrepancy is explained rather than mysterious.

## The plugin surface interaction

Spec 018's bundle is generated and hash-verified: `verify-agent-bundle.mjs`
compares a regenerated manifest against the committed baseline and fails on drift.
Editing the six wrappers therefore *must* be followed by
`pnpm build:agent-bundle` and a commit of the new `bundle-manifest.json`, or CI
fails.

This is the integrity mechanism working as designed — a template edit is not
allowed to slip through unreviewed. It is called out here so the plan sequences the
regeneration rather than discovering it as a CI failure.

The slash-command *names* (`/aker-build:check`) do not change: those derive from
the plugin name in `.claude-plugin/plugin.json`, which is the distribution
identity, not the command. Only the command examples inside the wrapper bodies
change.

## Testing

| Test | Proves |
|---|---|
| `pnpm test` | The 7 updated CLI tests pass; no other test depended on the old string |
| `pnpm typecheck` | No type surface changed |
| `pnpm test:agent-bundle` | Manifest baseline matches after regeneration; verbs still resolve |
| `pnpm test:cli-package` | Tarball builds, packs, installs, and smokes with the new bin name |
| Grep assertion | No `` `aker-build <verb>` `` invocation remains in live (non-historical) files |
| Scope assertion | `@aker-build/*` reference count is unchanged at 195 |

The last two are the ones that matter most: one proves the rename is complete, the
other proves it did not leak into the package namespace. A rename verified only by
"tests pass" can be both incomplete and over-broad without failing anything.

## Out of scope

- Renaming `@aker-build/*` package scope.
- Renaming the `.aker-build/` output directory.
- Rewriting historical specs, ADRs, or roadmap documents.
- Publishing to either registry.
- A backward-compatible `aker-build` alias. Nothing is published, so there is
  nothing to be compatible with; shipping an alias for a name that never existed
  publicly would add a permanent second surface for no reason.

## Risks

| Risk | Mitigation |
|---|---|
| Rename leaks into `@aker-build/*` scope | Test asserts the reference count stays at 195 |
| An error string is missed, telling users to run a dead command | Grep assertion over live files, excluding historical records by path |
| Plugin manifest drift fails CI | Plan sequences `pnpm build:agent-bundle` and the baseline commit immediately after wrapper edits |
| Old specs now name a dead command | Accepted deliberately; recorded in `CHANGELOG.md` rather than by rewriting records |
| `.aker-build/` output dir mistaken for a command reference | Explicitly out of scope; grep patterns match `aker-build <verb>`, not the bare string |
