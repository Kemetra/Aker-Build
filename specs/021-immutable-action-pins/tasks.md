# Tasks: Immutable GitHub Action Pins

- [x] T001 Add failing all-workflow action-pin and checkout-safety tests.
- [x] T002 Retain the meaningful RED result.
- [x] T003 Pin all 14 action references and harden every checkout.
- [x] T004 Run focused GREEN tests, typecheck, and semantic workflow audit.
- [x] T005 Document selected releases and controlled update policy.
- [x] T006 Run the full verification matrix and exact scope audit.
- [x] T007 Record evidence and mark Spec 021 implemented.
- [x] T008 Fast-forward local integration and rerun the workspace suite.

## Stop Conditions

- Any trigger, permission, command, input, job, Node version, or release behavior
  changes beyond the approved action/runtime upgrade.
- Any unverified SHA, persisted checkout credential, new action, or remote change
  is required.

## Verification Evidence — 2026-07-20

- Source verification: direct `git ls-remote` against the official action
  repositories resolved checkout v6.0.2 to
  `de0fac2e4500dabe0009e67214ff5f5447ce83dd` and setup-node v6.4.0 to
  `48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e`.
- TDD RED/GREEN: the new all-workflow contract first rejected mutable
  `actions/checkout@v6`; after implementation, focused workflow tests passed
  9/9 and CLI typecheck passed.
- Contract: three workflow files contain exactly 14 approved full-SHA action
  references (7 checkout, 7 setup-node), zero mutable/short/unknown references,
  and seven checkouts with `persist-credentials: false`.
- Semantic audit: normalized SHA-256 hashes before and after were identical for
  all three workflows after excluding only action refs and checkout persistence:
  `7eb2d181...efe1`, `0653ee26...21a`, and `1752ed12...a56` respectively.
- Namespace: 348 active files passed integrity checks.
- Workspace: `pnpm test` passed 459 tests with only 3 credential-gated live App
  smokes skipped; `pnpm typecheck` passed all 13 participating packages.
- Distribution and behavior: package acceptance passed 21/21 with the exact
  five-file zero-dependency tarball; all 19 benchmark cases met thresholds; the
  first-run smoke passed and removed its temporary directory.
- Scope: exactly 14 approved files changed from the local integration base, with
  zero manifest, lockfile, product source, new action, updater, generated
  artifact, secret, permission, or remote mutation.
- Integration: `integration/origin-main-reconcile` fast-forwarded to the verified
  Spec 021 head and `pnpm test` passed again with 459 tests and the same 3
  credential-gated skips.
