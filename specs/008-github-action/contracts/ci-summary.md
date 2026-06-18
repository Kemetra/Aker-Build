# Contract: CI summary content

What the CI run surfaces for a PR. The summary is **007's `review.md`** rendered into the run, with the
verdict + contributing findings + evidence. 008 adds no new rendering — it reuses 007's output.

## Content (from `review.md` / `review.json`)

```text
# Review: <Ready | Not Ready | Needs Verification>        # the verdict (FR-003)

**Mode:** <local-diff|pr> · [**Item:** <id>] · **Changed files:** <n>
[**PR #<n>:** <title> (<state>, base <ref>)]              # PR mode (007 FR-005)

## Contributing findings                                  # each with gate id + evidence (FR-003)
- **<TG-Gx>** (<status>, <severity>)
  - `<path>:<line>` — <signal>                            # signal name only; NEVER a raw secret (FR-006)
- **scope** — `<file>` is <forbidden|outside allowed> for <item>

## Scope
<no scope checked | checked against <item> — N out-of-scope changes>

## Changed files
- `<path>` ...

## Verdict
**<label>** — <one-line reason>
```

## Invariants

- The summary MUST contain the **verdict** and the **contributing findings with evidence** (FR-003, SC-001).
- No raw secret value MUST appear (FR-006, SC-005) — inherited: 007/004/002 evidence names the `signal`,
  never the value.
- On a TenantGuard error, the summary MUST show a **clear failure** (the error), not a passing summary
  (FR-008, SC-007).
- Empty diff → the summary says "nothing to review" and the check does **not** fail (Edge Cases).

## Relationship to the check status

The summary (this contract) is independent of pass/fail: a Not-Ready summary can accompany a **passing**
check when no `severity:"critical"` finding is present (SC-003). The check status is governed by
`contracts/action-inputs.md`'s decision rule.
