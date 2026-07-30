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

## The four things that share the string `aker-build`

Conflating these is the expensive mistake this spec exists to prevent. Only the
first two change.

| Thing | Example | Count | Action |
|---|---|---|---|
| **The user-typed command** | `bin` declaration; `` `Run `aker-build scan`` `` in error text | ~29 files | **Rename** |
| **The bundle filename** | `dist/aker-build.js`, and the validator asserting it | 5 files | **Rename** — follows the bin |
| **The internal package scope** | `@aker-build/queue`, `@aker-build/gates` | 195 refs | **Leave** |
| **Output artifact names** | `.aker-build/queue.json`, `aker-build-report.json` | many | **Leave** |

**The scope must not change.** `@aker-build/*` is a package namespace users never
see. Renaming it across 14 workspace packages is precisely the broad refactor
`CLAUDE.md` forbids, and it delivers no user-visible benefit.

**Output artifact names must not change.** `.aker-build/` is a directory, and
`aker-build-report.json` / `aker-build-report.md` are documented output filenames
referenced by the report contract (`contracts/report.schema.json`), both smoke
scripts, and `packages/report`. Renaming them would break the published output
contract and orphan every existing artifact directory, for no user-visible gain.
Neither is a command.

**The bundle filename does change**, because it is the bin target. `scripts/cli-package.mjs`
*validates* that `bin["aker-build"] === "dist/aker-build.js"` and that the packed
file list contains `dist/aker-build.js`, so the validator and its tests move in
lockstep with the rename or `pnpm test:cli-package` fails. That coupling is
desirable: it means the rename cannot be half-applied in the release path.

**The error strings must change.** If the bin becomes `aker` and the text does
not, the tool prints *"Run `aker-build scan` first"* — instructions for a command
that no longer exists. That is a correctness defect, not cosmetics. It is the
reason this rename cannot be limited to the `bin` field.

## What changes

| Group | Files | Change |
|---|---|---|
| Bin declarations | `packages/cli/package.json:30`, `scripts/build-cli-package.mjs:72` | `"aker-build":` → `"aker":` |
| Bundle filename + its validator | `scripts/build-cli-package.mjs` (:47, :59, :73), `scripts/cli-package.mjs` (:2, :42, :43), `scripts/cli-package.test.mjs` (:21, :22, :39, :50, :97), `scripts/verify-cli-package.mjs:85` | `dist/aker-build.js` → `dist/aker.js`; the Windows shim becomes `aker.cmd` |
| User-facing error text | `packages/cli/src/commands/map.ts:25`, `packages/gates/src/context.ts:30`, `packages/prompt/src/io.ts:15`, `packages/queue/src/context.ts` (:32, :44), `packages/queue/src/index.ts:72`, `packages/review/src/io.ts:19`, `packages/mcp/src/ensure.ts:37` (doc comment) | `` `aker-build <verb>` `` → `` `aker <verb>` `` |
| Test labels | 7 `describe()` strings under `packages/cli/tests/` | Cosmetic; update for consistency |
| **New** error-text test | `packages/queue/tests/` | See below — no test currently pins these strings |
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

## The error strings are currently unguarded

Measured, not assumed: the seven `aker-build <verb>` hits under
`packages/cli/tests/` are all `describe()` **labels**. No test asserts the error
text itself. So today, changing the bin name and forgetting an error string would
leave the tool telling users to run a command that does not exist, and the entire
suite would still pass.

The rename therefore adds a real assertion on the guidance text — the one thing a
user acts on. Without it this spec's central correctness claim rests on grep, which
is a one-time check rather than a standing guard.

## Testing

| Test | Proves |
|---|---|
| New error-text test | `MissingProjectMapError` / `MissingRisksError` / `MissingQueueError` messages name `aker <verb>`, so a future rename cannot silently strand users |
| `pnpm test` | Nothing else depended on the old string |
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
- Renaming output artifacts: the `.aker-build/` directory, `aker-build-report.json`,
  `aker-build-report.md`.
- Renaming the npm or PyPI distribution. Both stay `aker-build`.
- Rewriting historical specs, ADRs, or roadmap documents.
- Publishing to either registry.
- A backward-compatible `aker-build` alias. Nothing is published, so there is
  nothing to be compatible with; shipping an alias for a name that never existed
  publicly would add a permanent second surface for no reason.

## Risks

| Risk | Mitigation |
|---|---|
| Rename leaks into `@aker-build/*` scope | Test asserts the reference count stays at 195 |
| An error string is missed, telling users to run a dead command | A new test asserts the guidance text (none exists today — the current 7 hits are `describe()` labels), plus a grep assertion over live files excluding historical records by path |
| Bundle filename renamed but its validator not | `scripts/cli-package.mjs` asserts both the bin target and the packed file list, so `pnpm test:cli-package` fails on a half-applied rename |
| Plugin manifest drift fails CI | Plan sequences `pnpm build:agent-bundle` and the baseline commit immediately after wrapper edits |
| Old specs now name a dead command | Accepted deliberately; recorded in `CHANGELOG.md` rather than by rewriting records |
| Output artifact names mistaken for command references | Explicitly out of scope: `.aker-build/`, `aker-build-report.json`, `aker-build-report.md`. Grep patterns match `aker-build <verb>`, never the bare string |
