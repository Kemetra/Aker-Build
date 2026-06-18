# Quickstart: GitHub Action

How to run TenantGuard on every PR. **This is documentation, not a live workflow** — copy the example
below into your own repo's `.github/workflows/` to opt in (008 deliberately ships no live workflow file,
AC-008; adopting it is your separately-gated choice).

---

## Example workflow (copy into your repo to adopt)

> Runs on `pull_request`, checks out the **PR head** (load-bearing — the gates inspect the local working
> tree), runs `scan → review-pr`, surfaces the verdict, and optionally fails on a critical gate.

```yaml
# .github/workflows/tenantguard.yml  (EXAMPLE — copy into your repo to enable)
name: TenantGuard
on:
  pull_request:

permissions:
  contents: read          # read-only; no write/issues/pull-requests permissions needed

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the PR head            # MUST be the PR head, not the base
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}
          fetch-depth: 0                        # full history so `git diff` sees the change

      - name: Set up Node + pnpm
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: corepack enable

      # TenantGuard's CLI is TypeScript (no published binary yet) — run it via tsx (ADR-007).
      # Replace <tenantguard-checkout> with how you vendor the tooling (submodule / checkout / future package).
      - name: Run TenantGuard (scan → review-pr)
        run: |
          corepack pnpm dlx tsx <tenantguard-checkout>/packages/cli/src/bin.ts scan --out .tenantguard
          corepack pnpm dlx tsx <tenantguard-checkout>/packages/cli/src/bin.ts review-pr --local-diff --out .tenantguard

      - name: Publish summary
        if: always()
        run: cat .tenantguard/review.md >> "$GITHUB_STEP_SUMMARY"

      # Optional critical-gate-blocking: fail ONLY on a severity:"critical" finding (not the verdict).
      - name: Enforce critical gates
        if: ${{ inputs.fail-on-critical || false }}
        run: |
          crit=$(jq '[.findings[] | select(.severity == "critical")] | length' .tenantguard/review.json)
          echo "critical findings: $crit"
          if [ "$crit" -gt 0 ]; then
            echo "::error::TenantGuard: $crit critical gate finding(s) — failing the check."
            exit 1
          fi
```

Notes:
- **PR head checkout is required.** Without it, the gates inspect the base, not the PR → a false "Ready".
- **`review-pr` runs the gates internally** — no separate `gates` step is needed.
- **Critical-blocking keys off `severity:"critical"`**, not the verdict: a `not_ready` verdict with only
  `high`/`medium` findings still **passes** (report-only), satisfying SC-003.
- **Read-only**: `permissions: contents: read`; the job never commits, pushes, comments, or labels.

---

## Acceptance mapping (spec → planned verification)

| Spec criterion | Verified by |
|----------------|-------------|
| SC-001 PR run produces verdict + findings summary | the `Publish summary` step renders `review.md` (007 output) |
| SC-002 critical → check fails (when enabled) | the `jq` gate step exits 1 on a `severity:"critical"` finding |
| SC-003 non-critical → passes, still reported | `jq` finds 0 critical → step passes; summary still shows findings |
| SC-004 0 writes to the repo | `permissions: contents: read`; no mutating steps |
| SC-005 0 secrets in summary/logs | `review.md` names `signal` only (007/004/002 evidence) |
| SC-006 0 stored tokens | no token input; host token only |
| SC-007 TenantGuard error → clear fail | a non-zero CLI step fails the job (`if: always()` summary still shows context) |
| chain correctness (checkout → scan → review-pr) | matches 007's contract + the 007 review e2e |

---

## Adoption is opt-in

Copying this file into your repo activates CI on your PRs — that is **your** decision. TenantGuard ships
the contract + this example + **ADR-007** (CI runtime/packaging), not a live workflow. A published
`tenantguard` binary / packaged composite Action is a later, additive step.
