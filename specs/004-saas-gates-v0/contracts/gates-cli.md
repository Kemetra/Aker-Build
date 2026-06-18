# CLI Command Contract: `gates`

The gate runner's external interface. Behavior is binding; the framework is Commander (per ADR-002).
Exit codes and output shape are the contract downstream tooling/tests (005 router, 007 reviewer) rely
on.

---

## `tenantguard gates [path]`

Run the v0 gate set (or a subset) over a scanned repo and produce `risks.json`.

| Aspect | Contract |
|--------|----------|
| Argument | `[path]` — target repo dir. Default: current directory. |
| `--gates <ids>` | Comma-separated gate ids to run, e.g. `TG-G4,TG-G5`. Omitted → run the full set. Unknown id → exit `2` with a clear message listing valid ids (FR-006, R7). |
| `--out <dir>` | Output/input directory. Default: `./.tenantguard/`. Outside scanned tracked source. |
| `--stdout` | Print `risks.json` to stdout instead of writing a file. |
| Input | Reads `<out>/project-map.json` (produced by `tenantguard scan`). |
| Side effects | **Reads** the project map + target repo files only (via reused scanner read-only io). **Writes** `risks.json` to `--out`. **Never** creates/modifies/deletes a tracked file in the scanned repo (FR-008). No network, no credentials (FR-010). |
| Output (file) | `.tenantguard/risks.json` validating against the gates `risksSchema` (FR-002, FR-012). |
| stderr | Progress / warnings; errors. **No secret values** (FR-009, SC-006). |
| Exit codes | `0` risks.json produced & valid · `1` no `project-map.json` found (suggests running `tenantguard scan` first) · `2` bad input (unknown `--gates` id; target not a Git repo) · `3` internal error (produced risks.json failed schema validation — a gate bug; nothing written). |
| Determinism | Re-running over unchanged input yields an equivalent risk list (stable ordering) — FR-007 / SC-005. |

---

## Cross-cutting guarantees

- **Read-only on scanned repo** — verified by tests asserting 0 file changes after a run (FR-008).
- **Local-first** — no network, no credentials (FR-010 / SC-007).
- **No secrets** — secret-like content flagged as a finding; value never printed or written (FR-009 / SC-006).
- **Domain-neutral** — no Retail Tower / ERPNext / POS gate rules (FR-011).
- **Evidence-backed** — every `risk` finding cites ≥1 shared Evidence Object from 002 (FR-003 / SC-002).
- **Output conforms** — validated with the gates `risksSchema` before write (R3, FR-002).
