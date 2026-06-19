# P2 Calibrate / False-Positive Control — Design

Status: Designed, pending plan + review
Date: 2026-06-19
Roadmap: `docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md` (P2)
Builds on: P1 (landed, commit 932be9b) — detectors now emit `Evidence[]` with `confidence` set.

## Problem

P1 deepened detection: more detectors → more findings → more chances to be wrong.
A security tool that cries wolf gets muted. The findings must become *believed*.

The codebase already has the two axes needed — they are just not connected:

- **Severity** (`low|medium|high|critical`) on each `Finding` — "how bad if real."
  Already drives `QueueItem.risk`/`priority` (`derive.ts:67`) and the queue scorer
  (`score.ts:25`).
- **Confidence** (`high|medium|low`) on each `Evidence` item — "how sure we are."
  P1 sets it (`high` for structural matches, `medium` for heuristics). **Today it is
  dropped at the derive step and never reaches the scorer or the PR blocker.**

P2 does **not** invent a `confirmed/suspected` vocabulary (an earlier roadmap draft did;
rejected). It **derives** a confidence tier from the `confidence` already present and threads
it through the three consumers that decide what surfaces, what routes first, and what blocks.

## Decision 1 — The collapse rule (the spine)

A `Finding` has `evidence: Evidence[]` (N items, each with its own `confidence`). The finding's
**confidence tier** is the **maximum** confidence across its evidence:

```text
tier = max(confidence over finding.evidence)   // high > medium > low
```

Naming maps to existing vocabulary, no new enum:
- `confirmed`  ≡ tier is `high`   (≥1 structural signal proves it)
- `suspected`  ≡ tier is `medium` or `low` (only heuristic/name-based signals)

Rationale for **max** (not all-high): a single hard structural proof should confirm a finding
regardless of softer corroborating signals. A G4 route finding citing a `high` `route_definition`
plus a `medium` admin-name heuristic is `confirmed` — the structural fact dominates.

## Decision 2 — Propagation via a shared pure function over `Finding`

The collapse rule must live where **both** consumers can reach it. Verified consumers:
`derive.ts` works on `Finding`s; `review/pr.ts` also works on `risks.findings` (Findings),
**not** QueueItems. So the tier is computed by a shared pure function, not stored on QueueItem:

```text
confidenceTier(finding: Finding): "confirmed" | "suspected"   ← NEW, in @tenantguard/gates
   │  (Decision 1: max over finding.evidence)
   ├──► derive.ts   → sets QueueItem.confidence_tier (additive optional, for the scorer)
   ├──► score.ts    → reads QueueItem.confidence_tier as a NEW scoring factor
   └──► review/pr.ts→ calls confidenceTier(finding) directly for the gating rule
```

- `confidenceTier` lives in `packages/gates/src` next to the `Finding` type — pure, no deps on
  queue/review, so both can import it without a cycle.
- `QueueItem.confidence_tier?: "confirmed" | "suspected"` — additive optional field set in
  `deriveItems` (the scorer reads the item, not the raw finding).
- `review/pr.ts` calls `confidenceTier(finding)` on each attributable finding directly.

## Decision 0 — Gate honesty (the precondition, folded into P2)

P2's calibration is only trustworthy if gate confidence is *honest*. Two facts forced this in:

- Gates already emit a real spread (verified: 11 high / 11 medium / 13 low across g0–g9), so the
  machinery is **not** a no-op — it genuinely demotes G5/G6/G7 heuristic findings to `suspected`.
- **But** `g4-security.ts` emits a known false positive at `confidence: "high"`: it flags *every*
  route in a file when a single auth-guard token is absent *anywhere* in that file
  (`g4-security.ts:27`, file-level not route-level). P2 would stamp this `confirmed` and let it
  gate — the false-positive control failing on the exact bug P1 flagged.

So P2 includes making gate confidence honest:

1. **Fix G4 to be route-precise AND confidence-varied** — a guard on the route line → no finding.
   An unguarded route line is `high` confidence only if *no* auth token appears anywhere in the
   file (provably unguarded); if a token exists elsewhere (likely `router.use(requireAuth)`
   middleware), it's `medium` (can't prove → `suspected`, advisory, never blocks). This stops the
   common middleware pattern from being a high-confidence false positive — the uncertain case
   self-demotes instead of dishonestly gating.
2. **Confidence reflects evidence quality, repo-wide rule:** structural/line-precise proof →
   `high`; name-or-heuristic inference → `medium`; absence/needs-external-evidence → `low`. Audit
   each gate's `lineEvidence(..., confidence)` args against this rule; correct any that overstate.
   (Most already comply — this is a targeted honesty pass, not a rewrite.)

Without Decision 0, "only confirmed may gate" filters dishonest noise straight through. With it,
`confirmed` means *provably structural*, which is the precondition P6 (enforcing CI) depends on.

## Decision 3 — The consumers (each a separate plan task)

1. **Queue scoring** (`packages/queue/src/score.ts`): add a `confidence` factor.
   `confirmed` → value 1, `suspected` → value 0. Weight rebalanced from the existing factors
   (the six current weights sum to 1.0; carve the new factor's weight out of `risk` so the sum
   stays 1.0 and existing tests that assert totals are updated deliberately, not accidentally).
   Effect: a `confirmed/critical` finding routes ahead of a `suspected/critical` one — the
   precision lever. Low-confidence findings are still surfaced, never silently dropped.

2. **Review/PR blocking** (`packages/review/src/pr.ts` + `risk-blocks`): `pr.ts` already works on
   `risks.findings` (Findings, verified at `pr.ts:51`), so it calls `confidenceTier(finding)`
   directly. The "Ready/Not Ready" verdict may **only** be driven to *Not Ready* by `confirmed`
   findings. `suspected` findings appear in the report as advisory notes but never flip the
   verdict. This is the rule P6 (enforcing CI) later depends on — block only on proven precision.

3. **Config thresholds** (`packages/config` + the 013 boundary): a repo may set a minimum tier
   per gate, e.g. `{ "gates": { "TG-G7": { "min_tier": "confirmed" } } }`, to *suppress from
   surfacing* anything below the threshold for that gate. Reuses the audited, expiring
   suppressions model — never a silent drop; a suppressed-by-threshold finding is recorded as
   such. Absence of config ≡ surface everything (honest default).

## Non-goals

- No new evidence field on `Evidence` — tier is *derived*, not stored.
- No `confirmed/suspected` enum on `Finding` or `Evidence`.
- No change to **detector** logic (P1 is done). Gate *judgment* logic DOES change — narrowly:
  the G4 route-precision fix (Decision 0.1) and the confidence-honesty audit (Decision 0.2).
  Both stay within existing gate files; no new gates, no broad rewrite (constitution).
- No agent execution, no mutation, no auto-block without opt-in (P6's job, not P2's).
- No `SCHEMA_VERSION` bumps — all additions are optional/additive.

## Testability

- **G4 route-precision (Decision 0.1):** a file with one guarded route + one unguarded route flags
  ONLY the unguarded one (today it flags both). A fully-guarded file flags nothing.
- **Confidence honesty (Decision 0.2):** per-gate assertions that structural findings carry `high`
  and heuristic findings carry `medium`/`low` per the rule.
- Collapse rule: unit tests over synthetic `Finding`s with mixed-confidence evidence
  (all-high → confirmed; one-high-rest-medium → confirmed; all-medium → suspected).
- Propagation: a derive test asserting `QueueItem.confidence_tier` for each case.
- Scorer: a test asserting `confirmed` outranks `suspected` at equal severity, and that the
  weight sum stays 1.0.
- Blocking: a review test asserting a `suspected`-only diff yields **Ready**, a `confirmed`
  finding yields **Not Ready**.
- Config: a test asserting a per-gate `min_tier` suppresses below-threshold findings *with an
  audited suppression record*, and that no-config surfaces everything.
