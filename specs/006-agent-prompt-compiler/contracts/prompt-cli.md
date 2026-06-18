# CLI Command Contract: `prompt`

The prompt compiler's external interface. Behavior is binding; the framework is Commander (ADR-002).
Exit codes and output are the contract.

---

## `tenantguard prompt <ID> [--agent <name>]`

Compile a safe, scope-limited Markdown prompt for queue item `<ID>`.

| Aspect | Contract |
|--------|----------|
| Argument | `<ID>` — the queue item id (e.g. `Q-001`). Required. |
| `--agent <name>` | `claude` \| `codex` \| `generic`. Default `generic`. Unknown name → generic renderer + a note (FR-010). |
| `--out <dir>` | Directory holding `queue.json`; `prompt-<ID>.md` written here. Default `./.tenantguard/`. |
| `--stdout` | Print the prompt only; do not write a file. |
| Input | Reads `<out>/queue.json` (005) and looks up the item by `id`. |
| Side effects | Read-only on the scanned repo; writes `prompt-<ID>.md` to `--out` unless `--stdout`. No network/credentials (FR-011). |
| Output (stdout) | The compiled **Markdown** prompt (always printed). |
| Output (file) | `.tenantguard/prompt-<ID>.md` (unless `--stdout`), FR-014. |
| Exit codes | `0` prompt compiled · `1` missing `queue.json` (run `tenantguard queue` first) · `2` bad input: unknown `<ID>`, not a Git repo, **or item missing required scope info (refusal, FR-009)** — message names the cause · `3` internal error. |
| Determinism | Same `(item, agent)` → byte-identical output (FR-016 / SC-008). |

---

## Cross-cutting guarantees

- **Read-only on scanned repo**; output only to the out-dir (VI).
- **Local-first** — no network/credentials (FR-011 / SC-007).
- **No secrets** — secret-like context excluded + flagged, never rendered (FR-007 / SC-004).
- **No mutation instructions** — the prompt never tells the agent to commit/push/merge (FR-008 / SC-004).
- **Identical safety across renderers** — git rules + stop conditions + final-report byte-identical (FR-015 / SC-005).
- **Refuse, don't degrade** — a scope-incomplete item is refused, never compiled into an unsafe prompt (FR-009 / SC-006).
- **Domain-neutral** — no Retail Tower / ERPNext / POS content (FR-012).
