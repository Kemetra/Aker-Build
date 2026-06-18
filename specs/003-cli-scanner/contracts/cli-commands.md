# CLI Command Contract: `scan` and `map`

The scanner's external interface (CLI commands). Behavior is binding; the framework is Commander
(research R1). Exit codes and output shape are the contract downstream tooling/tests rely on.

---

## `tenantguard scan [path]`

Scan a target repo (read-only) and produce a Project Map.

| Aspect | Contract |
|--------|----------|
| Argument | `[path]` — target repo dir. Default: current directory. |
| `--out <dir>` | Output directory. Default: `./.tenantguard/`. Outside scanned tracked source. |
| `--stdout` | Print the map JSON to stdout instead of writing a file. |
| `--format <json\|yaml>` | Output format for the written/printed map. Default `json` (canonical). |
| Side effects | **Reads** target repo files only. **Writes** `project-map.json` (+ optional run notes) to `--out`. **Never** creates/modifies/deletes a tracked file in the scanned repo (FR-003). No network, no credentials (FR-011). |
| Output (file) | `project-map.json` validating against `@tenantguard/project-map` (FR-002). |
| Output (notes) | Run notes (skips, insufficient-evidence, flagged secrets) — in the map's evidence annotations and/or a run summary. **No secret values** (FR-012). |
| stderr | Progress / warnings; errors. |
| Exit codes | `0` map produced & valid · `1` target not a Git repo (out of MVP scope, clear message) · `2` internal error (e.g. assembled map failed 002 validation — a scanner bug; nothing written). |
| Determinism | Re-running on an unchanged repo yields an equivalent map (stable ordering) — FR-010 / SC-005. |

## `tenantguard map`

Show / re-emit the produced Project Map.

| Aspect | Contract |
|--------|----------|
| `--out <dir>` / source | Reads the previously produced map from the designated path (default `./.tenantguard/project-map.json`). |
| `--format <json\|yaml>` | Render format. Default `json`. |
| Side effects | Read-only; prints the map. Does not re-scan. |
| Exit codes | `0` map shown · `1` no produced map found (suggests running `scan` first). |

---

## Cross-cutting guarantees (both commands)

- **Read-only on scanned repo** — verified by tests asserting 0 file changes after a run (SC-002).
- **Local-first** — no network, no credentials (SC-007).
- **No secrets** — never printed or written (SC-006).
- **Domain-neutral** — no Retail Tower / ERPNext / POS behavior (FR-013).
- **Output conforms to 002** — validated with `@tenantguard/project-map` before write (R5, SC-001).
