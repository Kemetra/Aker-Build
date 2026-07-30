---
name: aker-build
description: >-
  Find the next safest task in a repository and the exact files it is allowed to
  touch, using Aker Build's read-only build kernel. Use when a user or agent asks
  what to work on next, which change is safe to make, what a repository's
  architecture or multi-tenant risks are, whether a diff or PR is ready to merge,
  or asks for a scoped prompt for a coding task. Also use before starting
  unscoped work in an unfamiliar repository, when someone asks "what should I do
  next here", or when a change needs a defensible file scope rather than a
  guessed one.
---

# Aker Build

Aker Build is a build-control kernel: it scans a repository, runs SaaS gates over
what it finds, derives a queue, and routes the one next-safest task along with the
files that task may touch. Everything it exposes is read-only — it reports, and
never mutates, enforces, or executes an agent.

## Getting the next action

Prefer the machine contract over guessing a command. Two surfaces return it:

- The MCP tool `aker_build_next_task`, when the server is wired.
- Otherwise the CLI: `aker route --stdout --format json`.

Both return one decision: either an item with its derived scope, or an explicit
"no safe task" with named reasons, plus a `blocked` list explaining every item the
router declined. Guessing a verb or inventing a task id produces a confidently
wrong answer; the contract returns either an action or a named blocker, which is
always actionable.

If the queue does not exist yet, run the chain first: `aker check .` performs
scan → gates → queue → route → report in one read-only pass.

## Reporting scope

`allowed_files` and `forbidden_files` are *derived* from a scan of the
architecture, not declared by hand. Report them as returned. Widening the set
discards the analysis that justified it, and the derived scope is the reason the
task was considered safe in the first place.

Use `aker_build_compile_prompt` (or `aker prompt <id>`) to get the scoped
prompt for an item. The compiler refuses to emit a prompt when scope information
is missing rather than guessing — treat that refusal as a real signal about the
item, not an error to work around.

## What this kernel does not claim

- **Findings are advisory.** A clean `check` is necessary, not sufficient. It does
  not prove semantic correctness and it grants no approval.
- **Never emit a readiness or confidence score.** Queue items already carry a
  measured `confidence_tier` (`confirmed` or `suspected`). A synthesized score
  layers a fabricated number on measured ones, and a reader cannot tell which is
  which.
- **Report a `suspected` tier as suspected.** The tier is the honest statement of
  how much evidence exists; upgrading it in a summary destroys the distinction
  that makes the tier useful.
- **Never simulate output.** If `aker` is not installed, say so and point to
  `npx --package aker-build aker check .` rather than describing what it would have
  printed.

## Discovering the surface

Nothing here needs memorizing:

- `/aker-build:help` prints the installed slash-command map.
- `aker --help` lists every installed CLI verb.

The package and the command have different names: you install `aker-build` and you run
`aker`. Saying "install `aker`" or "run `aker-build`" sends people somewhere that does
not exist, so keep the two straight when giving install advice.

Slash commands and CLI verbs are different surfaces: a slash command is a reviewed
prompt inside this agent session, while `aker-build` is a separately installed npm
package. Useful CLI verbs with no slash wrapper include `scan`, `map`, `gates`, and
`queue` — they are sub-steps of `check`, and running them out of order produces
artifacts that do not correspond to one another.
