---
description: Show the installed Aker Build command map and how each surface is used
---

Report the installed Aker Build surface truthfully; never advertise anything
absent from this list.

Slash commands (Claude Code namespaces them by plugin, so invoke as
`/aker-build:<name>`, e.g. `/aker-build:next`):

- `help` -- this command map.
- `check` -- run the read-only chain and interpret its findings.
- `next` -- return the one next-safest task with its derived file scope.
- `status` -- report the state of produced artifacts as recorded.
- `review` -- review a local diff or PR for merge readiness.
- `prompt` -- compile the safe, scoped prompt for one queue item.

Bundled skill: `aker-build` (the build-kernel router).

Slash commands and terminal CLI verbs are different surfaces: a slash command is a
reviewed prompt inside this agent session, while `aker-build` is a separately
installed npm package (`npx aker-build check .`). If it is not installed, say so
instead of simulating its output. CLI-only verbs include `scan`, `map`, `gates`,
and `queue` (sub-steps of `check`); list everything with `aker-build --help`.
