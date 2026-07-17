# CLI Command Contract: `queue` and `route`

The queue/router external interface. Behavior is binding; the framework is Commander (ADR-002). Exit
codes and output shape are the contract downstream tooling/tests (006) rely on.

---

## `aker-build queue [path]`

Derive `queue.json` from the project map + gate findings.

| Aspect | Contract |
|--------|----------|
| Argument | `[path]` — target repo dir. Default: current directory. |
| `--out <dir>` | Output/input directory. Default `./.aker-build/`. Holds `project-map.json` + `risks.json`; `queue.json` written here. |
| `--stdout` | Print `queue.json` to stdout instead of writing a file. |
| Input | Reads `<out>/project-map.json` (003) and `<out>/risks.json` (004). |
| Side effects | Read-only on the scanned repo; writes `queue.json` to `--out`. No network/credentials (FR-011). |
| Output (file) | `.aker-build/queue.json` validating against `queueSchema` (FR-001, SC-001). |
| Exit codes | `0` queue produced & valid · `1` missing `risks.json` (run `aker-build gates` first) / missing `project-map.json` (run `aker-build scan` first) · `2` bad input (not a Git repo) · `3` internal error (produced queue failed schema validation). |
| Determinism | Items stably sorted by `id`; re-run over unchanged input yields an equivalent queue. |

## `aker-build route [path]`

Select one next-safest task from the derived queue.

| Aspect | Contract |
|--------|----------|
| Argument | `[path]` — target repo dir. Default: current directory. |
| `--out <dir>` | Directory holding `queue.json`; `route.json` written here. Default `./.aker-build/`. |
| `--stdout` | Print the decision JSON to stdout (the decision is always printed in summary form regardless). |
| Input | Reads `<out>/queue.json` (and optionally the local diff, read-only, via scanner io). |
| Side effects | Read-only on the scanned repo; writes `route.json` to `--out`. |
| Output (file) | `.aker-build/route.json` validating against `routeDecisionSchema`. |
| Output (stdout) | The chosen `next` (id, title, reason) or an explicit "no safe next task" with reasons. |
| Exit codes | `0` decision produced (incl. an explicit "no safe task") · `1` missing `queue.json` (run `aker-build queue` first) · `2` circular dependency or other input error reported · `3` internal error. |
| Determinism | Same decision for unchanged input (primary `score desc`; ties `blast_radius asc` → `risk asc` → `id asc`) — FR-009 / SC-005. |

---

## Cross-cutting guarantees (both commands)

- **Read-only on scanned repo** — verified by tests asserting 0 file changes (FR-011).
- **Local-first** — no network, no credentials (SC-007); optional diff read read-only, skipped when absent.
- **No secrets** — never printed or written (FR-012 / SC-007).
- **Domain-neutral** — no Retail Tower / ERPNext / POS rules (FR-013).
- **Evidence-traced** — finding-derived items cite source evidence (FR-003 / SC-002).
- **Explicit no-safe-task** — never an arbitrary pick (FR-007).
