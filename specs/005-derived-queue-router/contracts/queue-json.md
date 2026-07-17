# Output Contract: `queue.json`

The shape of the queue deriver's output. Consumed by `route` and by 006 (prompt compiler). The schema
lives in `packages/queue` (`queueSchema`) and **imports `evidenceSchema`** from
`@aker-build/project-map` (FR-003, R3).

---

## Top level

```jsonc
{
  "schema_version": 1,
  "items": [ /* QueueItem[] — stably sorted by id (R4) */ ]
}
```

## QueueItem

```jsonc
{
  "id": "Q-001",
  "title": "Add auth guard to admin route",
  "status": "ready",                       // ready | blocked | done (deriver: ready|blocked)
  "type": "implementation",                // implementation | test | docs | migration | chore
  "source": {
    "evidence": [                          // >=1 for finding-derived items; shared 002 shape
      { "type": "line", "path": "apps/api/routes/admin.ts", "line": 42,
        "signal": "admin route without a role guard", "confidence": "high" }
    ]
  },
  "priority": "high",                       // low | medium | high | critical
  "risk": "medium",                         // low | medium | high | critical
  "depends_on": [],
  "lock_scope": { "files": ["apps/api/routes/admin.ts"] },
  "allowed_files": ["apps/api/routes/admin.ts"],
  "forbidden_files": [],
  "gates": ["TG-G4"],
  "validation": ["pnpm -r test", "pnpm -r typecheck"],
  "stop_conditions": ["tests fail", "scope exceeds allowed_files"],
  "final_report": { "required": ["files changed", "tests run", "evidence", "git status", "next safe action"] }
}
```

## Field rules

- `status` ∈ {`ready`,`blocked`,`done`}; v0 deriver emits only `ready`/`blocked` (FR-014).
- `type` ∈ {`implementation`,`test`,`docs`,`migration`,`chore`} (FR-014).
- A finding-derived item MUST carry ≥1 `source.evidence` (FR-003); evidence uses the imported 002 shape.
- A finding with no safe scoped action → `status: blocked` (US1 #3), never `ready`.
- **No secret values** anywhere (FR-012); evidence reports patterns by `signal` name only.
- Items stably sorted by `id` (deterministic, R4).
