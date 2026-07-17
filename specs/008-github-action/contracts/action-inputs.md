# Contract: Action inputs & outputs

The configuration surface for the documented CI integration. These are **workflow inputs/env**, not a
new code API — 008 ships no new package (FR-002). The example workflow (quickstart.md) wires them.

## Inputs

| Input (env) | Meaning | Default | Maps to |
|-------------|---------|---------|---------|
| `fail-on-critical` | Enable critical-gate-blocking: the check FAILS when any `review.json` finding has `severity:"critical"`. | `false` | the post-review `jq` gate step |
| `out-dir` | Workspace dir for `review.json` / `review.md`. Outside the repo's tracked source. | `.aker-build` | `--out` on scan/review-pr |
| `gates` | Comma-separated gate ids to run (subset). Empty = full set. | (all) | `--gates` (where supported) |
| `item` | Optional queue item id for the scope check. | (none) | `--item` on review-pr |

No input accepts or stores a token; CI uses the host-provided token only (FR-007, SC-006).

## Outputs

| Output | Source | Requirement |
|--------|--------|-------------|
| **CI summary** | `review.md` rendered into the run (e.g. `$GITHUB_STEP_SUMMARY`): verdict + contributing findings + evidence. | FR-003, SC-001 |
| **check status** | pass / fail per the decision rule. | FR-004, SC-002, SC-003 |

## Check-status rule (authoritative)

```text
1. Aker Build could not run (review.json absent / a step exited non-zero)  → FAIL  (surface the error)   [FR-008/SC-007]
2. fail-on-critical = true  AND  ∃ finding with severity == "critical"      → FAIL  (name the gate(s))     [SC-002]
3. otherwise                                                                → PASS  (findings reported)    [SC-003]
```

- The **verdict** (Ready / Not Ready / Needs Verification) is always in the summary (FR-003) but does
  **not** by itself fail the check — any diff-attributable risk makes the verdict `not_ready`, so
  verdict-based failing would break SC-003.
- A non-zero CLI **exit code** means "couldn't review" (rule 1), not "unsafe" — a Not-Ready *verdict*
  exits 0.

## Guarantees

Read-only on the repo (no commit/push/merge/comment/label/issue — FR-005, SC-004) · no secrets in
summary/logs (FR-006, SC-005) · no stored tokens (FR-007, SC-006) · errors surface, never silent-pass
(FR-008, SC-007) · domain-neutral (FR-009).
