# Quickstart: PR Reviewer

Planned usage of `tenantguard review-pr` once implemented (after plan + tasks review). Illustrative —
**no code exists yet**.

---

## Full pipeline → readiness verdict

```bash
tenantguard scan        # → .tenantguard/project-map.json   (003)
tenantguard gates       # → .tenantguard/risks.json         (004)
tenantguard queue       # → .tenantguard/queue.json         (005)
# ... an agent (or human) makes changes against item Q-001 ...
tenantguard review-pr --local-diff --item Q-001   # → .tenantguard/review.json + review.md + printed
```

## Variants

```bash
tenantguard review-pr --local-diff           # gate review of the working diff; scope check skipped + noted
tenantguard review-pr 42                       # review GitHub PR #42 (uses your gh CLI)
tenantguard review-pr 42 --item Q-001          # PR review + scope check
tenantguard review-pr --local-diff --stdout    # print only, no files written
```

> **PR-mode v0 caveat:** the gates inspect your **local working tree**, while the changed-files set
> for a PR comes from GitHub. **Check out the PR branch locally** before `review-pr <number>`, or the
> PR's files won't exist locally, nothing will attribute, and the verdict could be a false "Ready".
> Reviewing a fetched PR diff without a local checkout is a later, additive capability.

Example (abbreviated) Markdown output:

```markdown
# Review: Not Ready

**Mode:** local-diff · **Item:** Q-001 · **Changed files:** 1

## Contributing findings
- **TG-G4** (risk, high) — admin route without role guard
  - `apps/api/routes/admin.ts:12` — admin route without role guard

## Scope
Checked against Q-001 — no out-of-scope changes.

## Verdict
**Not Ready** — a diff-attributable risk finding blocks merge-readiness.
```

---

## Acceptance mapping (spec → planned verification)

| Spec criterion | Planned test |
|----------------|--------------|
| SC-001 exactly one verdict, with evidence | `verdict-exhaustive.test.ts` |
| SC-002 diff-attributable risk → Not Ready naming the gate | `risk-blocks.test.ts` |
| (R2) findings on unchanged files don't drive the verdict | `attribution.test.ts` |
| SC-004 unjudgeable → Needs Verification, never false pass | `needs-verification.test.ts` |
| SC-003 `--item` out-of-scope edit flagged | `scope-item.test.ts` |
| FR-003 no `--item` → scope skipped + noted, gates still run | `scope-skipped.test.ts` |
| SC-006 read-only (repo/diff unmodified) | `read-only.test.ts` |
| FR-009/SC-007 no secrets echoed | `no-secrets.test.ts` |
| FR-006 GitHub unavailable → clear gap, local-diff works | `pr-degrade.test.ts` |
| SC-007 deterministic | `determinism.test.ts` |
| CLI contract (exit codes, run-scan/queue-first, ids, gh-unavailable) | `cli.review.test.ts` |

---

## Guarantees

Exactly one of Ready / Not Ready / Needs Verification · per-finding evidence · diff-attributed gate
findings · optional scope check (skipped + noted without `--item`) · no secrets echoed · read-only ·
local-first (no credentials) · deterministic · 004 reused verbatim · domain-neutral.
