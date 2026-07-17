# Quickstart: Derived Queue & Router

Planned usage of `aker-build queue` / `route` once implemented (after plan + tasks review).
Illustrative — **no code exists yet**.

---

## Full pipeline

```bash
aker-build scan        # → .aker-build/project-map.json  (003)
aker-build gates       # → .aker-build/risks.json        (004)
aker-build queue       # → .aker-build/queue.json        (005)
aker-build route       # → .aker-build/route.json + prints the chosen next task
```

## Inspect

```bash
aker-build queue --stdout | jq '.items[] | {id, status, type, gates}'
aker-build route --stdout | jq '.next'
```

Example `route` stdout:

```text
next: Q-001 — Add auth guard to admin route
  reason: highest score (0.82): ready, low blast radius, validation available
blocked:
  Q-007 — depends_on Q-001 (not yet done)
```

---

## Acceptance mapping (spec → planned verification)

| Spec criterion | Planned test |
|----------------|--------------|
| SC-001 every item carries the full contract | `derive-contract.test.ts` |
| SC-002 finding-derived items trace to evidence | `evidence-trace.test.ts` |
| US1 #3 no-safe-action finding → blocked item | `blocked-derivation.test.ts` |
| SC-003 exactly one next + reason | `route-one.test.ts` |
| SC-004 blocked items include a reason | `route-one.test.ts` |
| FR-007 none safe → next:null + reasons | `no-safe-task.test.ts` |
| SC-006 circular dependency detected | `circular-deps.test.ts` |
| SC-005 deterministic decision + tiebreak | `determinism.test.ts` |
| US3 lock-overlap with diff → deprioritized/blocked | `lock-overlap.test.ts` |
| SC-007 no secrets in output | `secrets.test.ts` |
| CLI contract (exit codes, run-X-first) | `cli.queue-route.test.ts` |

---

## Guarantees

- Read-only on the scanned repo · local-first (no network/credentials) · no secrets · domain-neutral ·
  every finding-derived item evidence-traced · deterministic (pinned ordering) · explicit no-safe-task.
