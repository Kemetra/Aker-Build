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
  contents: read           # read the code (read-only; no writes)
  pull-requests: read      # `gh pr view` needs this to list the PR's changed files

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - name: Check out the PR head            # gates read file CONTENTS from the working tree
        uses: actions/checkout@v4
        with:
          ref: ${{ github.event.pull_request.head.sha }}

      - name: Set up Node + pnpm
        uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: corepack enable

      # TenantGuard's CLI is TypeScript (no published binary yet) — run it via tsx (ADR-007).
      # Replace <tenantguard-checkout> with how you vendor the tooling (submodule / checkout / future package).
      # `pnpm install` first so the workspace imports (@tenantguard/*) resolve.
      - name: Run TenantGuard (scan → review-pr <PR number>)
        env:
          GH_TOKEN: ${{ github.token }}        # `gh` auth in CI (no stored token)
        run: |
          cd <tenantguard-checkout> && corepack pnpm install --frozen-lockfile && cd -
          corepack pnpm dlx tsx <tenantguard-checkout>/packages/cli/src/bin.ts scan --out .tenantguard
          # PR-NUMBER mode: changed files come from `gh pr view` (relative to the PR BASE), not the
          # working tree. Do NOT use --local-diff here — after a CI checkout the tree == HEAD, so a
          # working-tree diff is EMPTY and every run would falsely report "Ready".
          corepack pnpm dlx tsx <tenantguard-checkout>/packages/cli/src/bin.ts \
            review-pr ${{ github.event.pull_request.number }} --out .tenantguard

      - name: Publish summary
        if: always()
        run: cat .tenantguard/review.md >> "$GITHUB_STEP_SUMMARY"

      # Optional critical-gate-blocking: fail ONLY on a severity:"critical" finding (not the verdict).
      # Gated by a repo variable (Settings → Variables) — `inputs` is NOT available on pull_request.
      - name: Enforce critical gates
        if: ${{ vars.TENANTGUARD_FAIL_ON_CRITICAL == 'true' }}
        run: |
          crit=$(jq '[.findings[] | select(.severity == "critical")] | length' .tenantguard/review.json)
          echo "critical findings: $crit"
          if [ "$crit" -gt 0 ]; then
            echo "::error::TenantGuard: $crit critical gate finding(s) — failing the check."
            exit 1
          fi
```

Notes:
- **Use PR-NUMBER mode in CI, not `--local-diff`.** `review-pr <number>` sources the changed files from
  `gh pr view` (relative to the PR base). `--local-diff` compares the working tree to HEAD — but after a
  CI checkout the tree **is** HEAD, so the diff is empty and every run would falsely report "Ready".
  `--local-diff` is for a developer's *uncommitted* changes locally, never a committed PR in CI.
- **PR-head checkout is still required** — the gates read file **contents** from the working tree, so the
  PR's code must be checked out (the changed-files *set* comes from `gh`, the *contents* from the tree).
- **`review-pr` runs the gates internally** — no separate `gates` step is needed.
- **Critical-blocking keys off `severity:"critical"`**, not the verdict: a `not_ready` verdict with only
  `high`/`medium` findings still **passes** (report-only), satisfying SC-003.
- **Enable critical-blocking** by setting the repo variable `TENANTGUARD_FAIL_ON_CRITICAL=true`
  (Settings → Variables). `inputs.*` is **not** available on a `pull_request` workflow — use `vars.*`.
- **`gh` auth + `pnpm install`**: PR mode needs `GH_TOKEN` (the job's `github.token`) and
  `pull-requests: read`; run `pnpm install` in the tooling checkout so `@tenantguard/*` imports resolve.
- **Error ≠ Not-Ready.** A non-zero CLI step (couldn't run — e.g. GitHub access unavailable) **fails the
  job** (FR-008/SC-007); a Not-Ready *verdict* (ran fine, exit 0) does not by itself fail. The summary
  step uses `if: always()` so it still renders on failure.
- **Read-only**: `permissions: contents/pull-requests: read`; the job never commits, pushes, comments, or labels.

---

## Acceptance mapping (spec → planned verification)

| Spec criterion | Verified by |
|----------------|-------------|
| SC-001 PR run produces verdict + findings summary | the `Publish summary` step renders `review.md` (007 output) |
| SC-002 critical → check fails (when enabled) | the `jq` gate step exits 1 on a `severity:"critical"` finding |
| SC-003 non-critical → passes, still reported | `jq` finds 0 critical → step passes; summary still shows findings |
| SC-004 0 writes to the repo | `permissions: contents/pull-requests: read`; no mutating steps |
| SC-005 0 secrets in summary/logs | `review.md` names `signal` only (007/004/002 evidence) |
| SC-006 0 stored tokens | no token input; the job's `github.token` only (`GH_TOKEN`) |
| SC-007 TenantGuard error → clear fail | a non-zero CLI step fails the job (`if: always()` summary still shows context) |
| chain correctness (checkout head → scan → review-pr `<number>`) | PR-number mode sources changed files from `gh pr view` (base-relative); gates read the checked-out tree — matches 007's `gh.ts` + e2e. **NOT `--local-diff`** (empty diff in CI). |

---

## Adoption is opt-in

Copying this file into your repo activates CI on your PRs — that is **your** decision. TenantGuard ships
the contract + this example + **ADR-007** (CI runtime/packaging), not a live workflow. A published
`tenantguard` binary / packaged composite Action is a later, additive step.
