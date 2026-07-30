# distribution/

Source of truth for Aker Build's **agent surface** — the Claude Code plugin that
lets an agent drive the read-only kernel.

## The authority rule

`agent-command-surface.yaml` is the single authority for what the generated bundle
advertises. An entry MAY reference a CLI verb but MUST NEVER define one: CLI verbs
are owned by `packages/cli/src/index.ts`. The agent surface is a projection of the
CLI, never a second source of truth — a surface that disagrees with its own kernel
is the failure this product exists to prevent.

## Flow

```text
agent-command-surface.yaml   (authority, shape described by contracts/agent-command-surface.schema.json)
        ↓
bundle-templates/claude/     (reviewed markdown: router skill + one wrapper per command)
        ↓
scripts/build-agent-bundle.mjs
        ↓
packages/plugin/dist/        (generated; bundle-manifest.json carries per-file SHA-256)
```

`packages/plugin/dist/` is generated. Never hand-edit it. Its
`bundle-manifest.json` **is** committed — it is the reviewed baseline the verifier
compares against, so a changed template shows up as a manifest diff in review
rather than as a silent regeneration. Everything else under `dist/` is ignored.

## Adding a command

1. Add an entry to `agent-command-surface.yaml` (`mode` must be `read-only`).
2. Write its wrapper under `bundle-templates/claude/commands/`.
3. Run `pnpm build:agent-bundle` and commit the updated `bundle-manifest.json`.
4. Run `pnpm test:agent-bundle`.

Reconciliation is bidirectional: a wrapper absent from the authority fails, and a
shipped entry with no wrapper fails. Record a planned-but-unshipped command with
`status: deferred` and empty wrapper fields — that is how `auto` (Spec 019) is
recorded today.

## Commands

```bash
pnpm build:agent-bundle   # generate packages/plugin/dist/
pnpm test:agent-bundle    # unit tests + full verification
```

## Why the tooling has no dependencies

`scripts/agent-bundle.mjs` parses both the authority YAML and wrapper frontmatter
itself rather than importing a library. The verifier answers "is this bundle
trustworthy?", and a dependency-free verifier runs on a fresh clone before any
install step. The authority uses a deliberately small YAML subset, and the parser
refuses anchors, aliases, and nested mappings rather than risk mis-reading a
construct it does not support.
