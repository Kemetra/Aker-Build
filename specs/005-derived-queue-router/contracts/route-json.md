# Output Contract: `route.json`

The shape of the router decision. Consumed by 006 (prompt compiler) and printed to stdout by
`aker-build route`. Schema lives in `packages/queue` (`routeDecisionSchema`).

---

## Shape (single stable shape — FR-015)

```jsonc
// A task was selected
{
  "next": {
    "id": "Q-001",
    "title": "Add auth guard to admin route",
    "reason": [
      "highest score (0.82): ready, low blast radius, validation available",
      "no lock-scope overlap with the current diff"
    ]
  },
  "blocked": [
    { "id": "Q-007", "reason": "depends_on Q-001 (not yet done)" },
    { "id": "Q-009", "reason": "circular dependency: Q-009 -> Q-010 -> Q-009" }
  ],
  "no_safe_task_reasons": []
}

// No safe task
{
  "next": null,
  "blocked": [ { "id": "Q-001", "reason": "failing gate TG-G4 blocks this item" } ],
  "no_safe_task_reasons": [ "all 1 item(s) are blocked", "no item is both ready and non-overlapping" ]
}
```

## Field rules

| Field | Type | Notes |
|-------|------|-------|
| `next` | `{ id, title, reason: string[] }` \| `null` | Always present; `null` when no item is safe (FR-007/FR-015). `reason[]` cites the scoring factors that won (FR-005). |
| `blocked` | `{ id, reason }[]` | Every blocked item with a blocking reason (FR-006, SC-004). |
| `no_safe_task_reasons` | `string[]` | Why nothing was selectable; **empty** when `next` is non-null (FR-015). |

- Exactly one `next` by default; never an arbitrary pick (FR-004, FR-007).
- Deterministic for unchanged input: primary `score desc`; ties `blast_radius asc` → `risk asc` →
  `id asc` (FR-009, SC-005).
- **No secrets** in any reason or field (FR-012, SC-007).
