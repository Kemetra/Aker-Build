# 016 Verification Evidence

**Verified**: 2026-07-17
**Result**: Local implementation and external diff review passed
**Boundary**: Hosted GitHub runs and repository settings remain owner-operated and pending

## Test-first contract

- RED: `pnpm --filter @aker-build/eval test -- repository-baseline` failed all seven new repository
  contracts against the prior repository state.
- GREEN: the same focused command passed all seven contracts after the approved changes.

## Local verification

| Command | Result |
|---|---|
| Hostile-global-config CLI/review/App-server test run | 154 passed; 3 credential-gated live tests skipped |
| `pnpm --filter @aker-build/github-app test` | 36 passed |
| `pnpm --filter @aker-build/github-app-server test` | 72 passed; 3 credential-gated live tests skipped |
| `pnpm test` | 395 passed; 3 credential-gated live tests skipped |
| `pnpm typecheck` | Passed across all 13 tested workspace projects |
| `pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp` | Passed end to end; temporary project removed |
| `pnpm audit --prod` | No known vulnerabilities found |
| `git diff --check` | Passed |

The hostile Git proof pointed `GIT_CONFIG_GLOBAL` at
`packages/eval/fixtures/hostile-gitconfig` and set `GIT_CONFIG_NOSYSTEM=1`. Fixture repositories
still committed successfully because they locally disabled signing and isolated hooks, global ignore,
and line-ending behavior. The machine's actual global Git configuration was not changed.

## External-review rejection checklist

- Evidence ledgers keep incomplete 014/015 tasks unchecked and route them to 017/018.
- Every workflow Action reference uses the reviewed full SHA with its release comment.
- Workflow permissions are job-scoped and limited to reads plus CodeQL's required
  `security-events: write`; the App permission docs allow only Checks writes.
- No product runtime, package manifest, lockfile, secret, mutation, P5/P6, or agent-execution surface
  changed in 016.
- Final changed paths match the approved reconciliation, CI, policy, documentation, and test scope.

## Hosted/manual handoff still pending

Local green evidence does not complete the following operator-owned steps:

1. Obtain the first successful GitHub runs for every quality-matrix job, benchmark,
   dependency-audit, and CodeQL.
2. Resolve any CodeQL default-setup conflict and enable the required checks/branch protection in
   repository settings as documented in `docs/operations/repository-protection.md`.
3. Run the credential-gated App smoke and public-webhook checklist against a registered App and test
   repository.

Until those steps have hosted evidence, describe 016 as a committed/local protection baseline, not
completed operational repository protection.
