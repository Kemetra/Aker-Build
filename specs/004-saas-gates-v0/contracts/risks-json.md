# Output Contract: `risks.json`

The shape of the gate runner's output artifact. This is what 005 (router) and 007 (reviewer) consume.
The schema lives in `packages/gates` (`risksSchema`) and **imports** `evidenceSchema` from
`@aker-build/project-map` — it does not redefine the evidence shape (FR-003, R3).

---

## Top level

```jsonc
{
  "schema_version": 1,
  "findings": [ /* Finding[] — single unified array, all statuses, stably sorted */ ]
}
```

- `findings` is the **only** collection — no separate `needs_verification[]` / `not_applicable[]`
  top-level lists (FR-012).
- Ordering is deterministic: sorted by `gate_id`, then by first evidence `path`, then `signal` (R5).

## Finding (discriminated on `status`)

Every finding has `gate_id` and `status`. The remaining fields are status-conditional:

```jsonc
// status: "risk"
{
  "gate_id": "TG-G4",
  "status": "risk",
  "severity": "high",                         // low | medium | high | critical
  "evidence": [
    { "type": "line", "path": "apps/api/routes/admin.ts", "line": 42,
      "signal": "admin route without role guard", "confidence": "high" }
  ]
}

// status: "needs_verification"
{
  "gate_id": "TG-G2",
  "status": "needs_verification",
  "severity": null,
  "evidence": [
    { "type": "missing_artifact", "path": null,
      "signal": "no diff evidence available for contract-drift check", "confidence": "low" }
  ]
}

// status: "not_applicable"
{
  "gate_id": "TG-G6",
  "status": "not_applicable",
  "severity": null,
  "evidence": []                              // MAY be empty
}
```

## Field rules

| Field | risk | needs_verification | not_applicable |
|-------|------|--------------------|----------------|
| `gate_id` | required | required | required |
| `status` | `"risk"` | `"needs_verification"` | `"not_applicable"` |
| `severity` | enum (required) | `null` | `null` |
| `evidence` | `≥1` | `≥1` | `≥0` |

- Evidence objects use the imported `{type, path, line?, signal, confidence}` shape exactly.
- **No** finding-level `location`/`confidence` — they live inside the evidence object(s).
- **No secret values** anywhere; secret-like content is reported only by `signal` name (FR-009).

## Empty / non-SaaS repo

- Zero `risk` findings (no fabrication).
- "Minimal," not necessarily empty: at most one `not_applicable` per inapplicable gate, and at most
  one `needs_verification` per gate lacking evidence (spec Edge Cases, reconciled with FR-005).
