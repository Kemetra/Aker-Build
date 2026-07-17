# P3 Prove It — Eval Harness + Benchmark — Design

Status: Designed, pending plan + review
Date: 2026-06-19
Roadmap: `docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md` (P3)
Builds on: P1 (landed, detectors) + P2 (PR #22, confidence tiers) — the metric is **tier-aware**, which is why P3 follows P2.

## Problem

After P1–P2, findings *look* credible. "Looks credible" ≠ "is correct." Without measurement,
every quality claim is an opinion, and any future detector/gate change can silently degrade
quality. P3 turns assertion into proof and creates a regression net.

## What already exists (reuse, don't reinvent)

- **Fixture pattern:** `packages/gates/tests/fixtures/{vuln,clean,nobilling}` are already
  self-contained synthetic repos. The corpus is this pattern, scaled and labeled.
- **Run pipeline:** `runGatesToFile(repoRoot, {out})` (gates) and `scanToFile` (scanner) produce
  the real `risks.json` — the harness consumes these public outputs only.
- **Matching key:** `findingId(finding)` = `gate_id:path:signal:status` (in `@aker-build/gates`)
  is the natural identity for comparing actual vs expected findings.
- **Tier:** `confidenceTier(finding)` (P2) gives the per-tier breakdown the metric needs.

## Decision 1 — Corpus shape (gate-scoped — resolves the baseline-noise problem)

**Verified baseline noise (probe over real fixtures):** running the full gate set over the `clean`
fixture fires **6 findings** (G2/G8/G9 `needs_verification`, G0/G3/G6 `not_applicable`) — all
correct baseline behavior, none "wrong." `vuln` fires 15, of which only **5 are the G4 leaks** the
case is about. So a *global* false-positive count would brand every correct baseline finding a false
positive and destroy precision.

**Resolution: every case is gate-scoped.** Each `benchmark/cases/<case-name>/` is a self-contained
synthetic git-initializable repo plus an `expected.json` that names the gates under test:

```jsonc
// benchmark/cases/unprotected-admin-route/expected.json
{
  "description": "An admin route with no role guard fires G4 at confirmed; nothing else G4-scoped.",
  "gates_under_test": ["TG-G4"],
  "expected_findings": [
    { "gate_id": "TG-G4", "path": "apps/api/admin.ts", "tier": "confirmed" }
  ]
}
```

- **The metric counts ONLY findings whose `gate_id` is in `gates_under_test`.** Findings from any
  other gate are *ignored* — neither true nor false positive. This excludes the baseline G0/G2/G8/G9
  noise and the `needs_verification`/`not_applicable` findings (they fall outside the tested gate).
- **True negatives / precision:** a case sets `"expected_findings": []` (with its `gates_under_test`)
  to assert the tested gate fires nothing on a clean variant — that is how false positives, hence
  precision, are measured.
- Cases drawn from real multi-tenant failure patterns: missing tenant filter, destructive
  migration, unprotected admin route, non-idempotent webhook, leaked secret. **Synthetic only —
  no Retail Tower / ERPNext private logic** (constitution hard rule).

## Decision 2 — The harness (a new `benchmark/` runner, not a package)

A runner (run via a root script, e.g. `pnpm benchmark`) that, for each case:
1. copies the case to a temp dir, `git init`s it (reuse the `gatesFixture` prep pattern),
2. runs `scanToFile` then `runGatesToFile` (the real public pipeline — no internals),
3. loads the produced `risks.json`, **keeps only findings whose `gate_id ∈ gates_under_test`**,
   collapses each to a match key `(gate_id, path, tier)`,
4. diffs against `expected.json` (also keyed `(gate_id, path, tier)`): true positive = expected key
   present in actual; false negative = expected but absent; false positive = actual (gate-scoped)
   but not expected.

**Matching key — NO signal-string matching.** Signal strings are human descriptions, not IDs
(the real gate emits `"API route without an auth guard"`, easy to mis-author from memory). The
stable key is `(gate_id, path, tier)`. `path` comes from `finding.evidence[0].path`; `tier` from
`confidenceTier(finding)`. Line numbers are excluded (they drift). If two findings in one case
share a `(gate_id, path, tier)` key, the case is too coarse — split it or the expected list dedupes
to one (documented behavior, asserted in a harness test).

**Boundary discipline:** the harness imports only public package surfaces (`scanToFile`,
`runGatesToFile`, `confidenceTier`, `findingId`) — never reaches into detector/gate internals. It
tests the *contract*, so it doubles as the external "does Aker Build work on my repo?" proof.

## Decision 3 — Metric: precision/recall PER TIER

For each confidence tier (`confirmed`, `suspected`) and overall:

```text
recall    = TP / (TP + FN)   — of the leaks that should fire, how many did
precision = TP / (TP + FP)   — of what fired, how many were real
```

The **per-tier** split is the whole point (and why P2 was a precondition): "at `confirmed`: G4
recall 0.92, precision 0.97" is a provable, trustworthy claim; a single blurry number hides whether
quality regressed *where it matters*. `confirmed`-tier precision is the number P6 (enforcing CI)
will gate on.

## Decision 4 — Scorecard artifact + regression thresholds

- **`benchmark-report.json` + `benchmark-report.md`** — versioned like every other output
  (a `schema_version`), per-gate × per-tier precision/recall, plus the raw TP/FP/FN lists for
  debugging. The markdown is the human-facing launch evidence.
- **`benchmark/thresholds.json`** — floors/ceilings, e.g.
  `{ "confirmed": { "min_recall": 0.85, "min_precision": 0.95 } }`. The runner exits non-zero if a
  threshold is breached, so the **dogfood CI** gates Aker Build's own quality by the discipline it
  sells. Absence of a threshold for a tier ≡ report-only (no gating) — honest default.

## Non-goals

- No change to detectors, gates, queue, or review logic — P3 only *measures* (read-only over
  public outputs).
- No private domain fixtures (Retail Tower / ERPNext) — synthetic cases only.
- No `SCHEMA_VERSION` bumps to existing artifacts — the scorecard is a NEW artifact with its own
  version.
- No ML/statistical-significance machinery — simple TP/FP/FN counting; the corpus is small and
  hand-labeled by design.

## Testability

- Harness unit tests: given a synthetic case + a stubbed `risks.json`, assert correct TP/FP/FN
  classification and correct per-tier precision/recall arithmetic (including div-by-zero → report
  `null`, not crash).
- **Gate-scoping test (the blocking-fix guard):** a stubbed `risks.json` containing baseline
  noise (G0/G2/G8/G9 findings) for a case with `gates_under_test: ["TG-G4"]` must yield ZERO false
  positives from that noise — only G4 findings are counted. (Verified real baseline: `clean` fires
  6 non-G4 findings, `vuln` fires 10 non-G4 — none may be penalized.)
- **Duplicate-key test:** two actual findings sharing `(gate_id, path, tier)` collapse/dedupe per
  the documented rule, not double-count.
- Threshold gating: a report below `min_recall` exits non-zero; at/above exits zero.
- At least one end-to-end case run through the real `scan → gates` pipeline (a `vuln`-style case
  yields its expected `confirmed` findings; a `clean` case yields none).
- Determinism: two runs over the same corpus produce byte-identical `benchmark-report.json`.
