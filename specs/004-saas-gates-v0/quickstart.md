# Quickstart: SaaS Gates v0

Planned usage of `tenantguard gates` once implemented (after plan + tasks review). Illustrative — **no
code exists yet**.

---

## Run the full gate set

```bash
# 1. Produce the project map first (003)
tenantguard scan

# 2. Run all v0 gates over the scanned repo → .tenantguard/risks.json
tenantguard gates
```

## Run a subset

```bash
# Only security + idempotency gates
tenantguard gates --gates TG-G4,TG-G5
```

## Inspect findings

```bash
tenantguard gates --stdout | jq '.findings[] | select(.status == "risk")'
```

Example `risks.json` (abbreviated):

```jsonc
{
  "schema_version": 1,
  "findings": [
    { "gate_id": "TG-G4", "status": "risk", "severity": "high",
      "evidence": [{ "type": "line", "path": "apps/api/routes/admin.ts", "line": 42,
                     "signal": "admin route without role guard", "confidence": "high" }] },
    { "gate_id": "TG-G2", "status": "needs_verification", "severity": null,
      "evidence": [{ "type": "missing_artifact", "path": null,
                     "signal": "no diff evidence available", "confidence": "low" }] },
    { "gate_id": "TG-G6", "status": "not_applicable", "severity": null, "evidence": [] }
  ]
}
```

---

## Acceptance mapping (spec → planned verification)

| Spec criterion | Planned test |
|----------------|--------------|
| SC-001 known violation → finding w/ evidence | `known-violation.test.ts` (per-gate violation fixture) |
| SC-002 100% findings cite gate+status; risk cite severity+evidence | `findings-shape.test.ts` |
| SC-003 clean repo → 0 false positives | `clean-no-fp.test.ts` (per-gate clean fixture) |
| SC-004 insufficient evidence → needs_verification | `needs-verification.test.ts` |
| SC-005 deterministic re-run | `determinism.test.ts` |
| SC-006 0 secrets in output | `secrets.test.ts` |
| SC-007 no network / credentials | covered across tests (no network client wired) |
| FR-005 inapplicable → not_applicable | `not-applicable.test.ts` |
| FR-006 subset by id | `subset.test.ts` |
| FR-008 read-only on scanned repo | `readonly.test.ts` |
| CLI contract (exit codes, --gates, run-scan-first) | `cli.gates.test.ts` |

---

## Guarantees (same as the constitution's principles)

- Read-only on the scanned repo · local-first (no network/credentials) · no secrets in output ·
  domain-neutral · every `risk` finding evidence-backed · deterministic.
