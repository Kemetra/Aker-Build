# Phase 1 Data Model: GitHub Action

008 introduces **no data schema** (it ships no code). The "model" here is the CI integration's
inputs/outputs and the entities the spec names, grounded in the real 007 `review.json` shape it consumes.

---

## Consumed artifact: `review.json` (from 007, verbatim)

```jsonc
{
  "schema_version": 1,
  "mode": "local-diff" | "pr",
  "verdict": "ready" | "not_ready" | "needs_verification",   // → drives the SUMMARY (FR-003)
  "changed_files": [ "..." ],
  "findings": [
    { "gate_id": "TG-G4", "status": "risk", "severity": "critical"|"high"|"medium"|"low"|null,  // → drives the CHECK (FR-004)
      "evidence": [ { "type","path","line?","signal","confidence" } ] },
    { "kind": "scope", "file": "...", "reason": "forbidden"|"outside_allowed", "item_id": "..." }
  ],
  "scope": { "checked": boolean, "item_id?": "...", "violations": [ ... ] },
  "github_available": true|false|null,
  "pr?": { "number", "title", "state", "base_ref" }
}
```

The Action **reads** this (and `review.md` for the human summary); it never writes to the repo.

---

## Entities (from the spec)

- **CI Run** — one execution of the documented workflow triggered by a `pull_request` event
  (and re-run on update, FR-001).
- **CI Summary** — the produced verdict + contributing findings + evidence, rendered from `review.md`
  into the run's output (e.g. `$GITHUB_STEP_SUMMARY`). FR-003 / SC-001.
- **Enforcement Mode** — whether critical-gate-blocking is on. When on, the check **fails iff** any
  `findings[].severity === "critical"` (incl. 004's TG-G9 aggregator). When off, report-only (the check
  passes). FR-004 / SC-002 / SC-003.

---

## Check-status decision (the core rule, R3 / FR-004)

```text
if (aker-build error: review.json absent or job step failed)        → CHECK FAILS (surface the error; FR-008/SC-007)
elif (fail_on_critical enabled AND any finding.severity == "critical") → CHECK FAILS (name the critical gate(s); SC-002)
else                                                                   → CHECK PASSES (findings still reported; SC-003)
```

- **Verdict ≠ check status.** A `not_ready` verdict with only `high`/`medium` findings → check
  **passes** (SC-003); the verdict is shown in the summary either way (FR-003).
- **Error ≠ Not-Ready.** A non-zero CLI exit (couldn't run) fails the job; a Not-Ready *verdict* (ran
  fine, exit 0) does not, unless a critical finding triggers blocking.

---

## Action inputs (documented; exact schema in contracts/action-inputs.md)

| Input | Meaning | Default |
|-------|---------|---------|
| `fail-on-critical` | Enable critical-gate-blocking (fail the check on a `severity:"critical"` finding). | `false` (report-only) |
| `out-dir` | Where `review.json`/`review.md` are written in the workspace. | `.aker-build` |
| `gates` | Optional subset of gate ids (passed through to the CLI). | all |
| `item` | Optional queue item id for the scope check (`--item`). | none |

## Action outputs

| Output | Source |
|--------|--------|
| CI summary | `review.md` rendered into the run (verdict + findings + evidence). FR-003. |
| check status | pass/fail per the decision rule above. FR-004. |

---

## What 008 does NOT introduce

- No Zod schema, no TypeScript, no new package (FR-002).
- No live `.github/workflows/*.yml` (AC-008) — the example workflow is documentation.
- No PR comments / labels / issues / commits (Non-Goals; Principle VI).
