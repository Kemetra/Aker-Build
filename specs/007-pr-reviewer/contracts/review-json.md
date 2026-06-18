# Contract: `review.json` (machine-readable review report)

The validated JSON artifact a review run produces. Consumed by 008 (the Action) to read a verdict.
Validated by a 007 **Zod** schema (`validateReview`) before write — an invalid document is a reviewer
bug (exit `3`, nothing written).

## Shape

```jsonc
{
  "schema_version": 1,                        // integer; bumped on breaking change
  "mode": "local-diff" | "pr",
  "verdict": "ready" | "not_ready" | "needs_verification",
  "changed_files": ["<repo-relative POSIX path>", ...],   // code-unit sorted, de-duplicated
  "findings": [                               // contributing (diff-attributable) findings + scope violations
    // gate finding (004 Finding, surfaced verbatim):
    { "gate_id": "TG-G4", "status": "risk" | "needs_verification",
      "severity": "low"|"medium"|"high"|"critical"|null,
      "evidence": [ { "type": "...", "path": "...", "line": 12, "signal": "...", "confidence": "..." } ] },
    // scope violation:
    { "kind": "scope", "file": "...", "reason": "forbidden" | "outside_allowed", "item_id": "Q-001" }
  ],
  "scope": {
    "checked": true | false,                  // false when no --item
    "item_id": "Q-001",                        // present iff checked
    "violations": [ { "file": "...", "reason": "forbidden" | "outside_allowed" } ]
  },
  "github_available": true | false | null     // PR mode: availability; null/absent for local-diff
}
```

## Invariants

- `verdict` is **exactly one** of the three values (SC-001).
- `verdict = "not_ready"` ⟺ at least one `findings[]` entry with `status: "risk"` **or** at least one
  scope violation (FR-012).
- `verdict = "needs_verification"` ⟺ no risk/scope-violation but ≥1 `needs_verification` finding.
- Every gate finding in `findings[]` is **diff-attributable**: some `evidence[].path` ∈ `changed_files`.
- `not_applicable` findings are **never** included (they don't contribute).
- No secret values appear anywhere — secret-like content is represented by `signal` name only (FR-009).
- `scope.checked = false` ⟹ `scope.violations = []` and no `item_id` (FR-003 skip-and-note).
- Byte-identical for identical input (code-unit-sorted `changed_files` + `findings`; no clock/random).

## Relationship to upstream

`findings[]` gate entries reuse the **002 `Evidence`** shape and the **004 `Finding`** `status`/`severity`
**verbatim** — never redefined. 007 adds only the `scope`-violation finding kind and the top-level
`mode`/`verdict`/`changed_files`/`scope`/`github_available` envelope.
