# 015 Acceptance and Implementation Evidence

**Reconciled**: 2026-07-17 under 016 external review
**Product status**: Implemented and locally verified; live field verification remains explicit
**Classification rule**: Each acceptance claim is classified as `automated`, `gated-live-smoke`,
`manual-operator`, or `unmet`. A skipped live test is not a pass.

## Task traceability

| Task | Status | Evidence | Review note |
|---|---|---|---|
| T001 | Implemented | Historical branch scope; `plan.md` | Runtime work stayed within the approved App/server/docs scope plus recorded live-edge deviations. |
| T002 | Implemented | `packages/github-app-server/package.json`, `tsconfig.json`, `vitest.config.ts` | Package exists and depends on the App core. |
| T003 | Implemented | Server manifest and `pnpm-lock.yaml` history | Octokit/auth dependencies are declared. 016 does not change them. |
| T004 | Implemented | `src/config.ts`, `src/http-server.ts` (`readInstallationId`) | Four environment inputs fail safely. |
| T005 | Implemented | `tests/config.test.ts`, `tests/installation-id.test.ts` | Missing/invalid inputs are named without values. |
| T006 | Implemented with test-file deviation | `tests/octokit-api.test.ts`, `tests/server.test.ts` | Create/update/find adapter and checks-only writes are covered outside the originally named file. |
| T007 | Implemented | `tests/git-workspace.test.ts`, `tests/git-workspace-real.test.ts` | Unique checkout, disposal, real fetch/checkout, partial cleanup. |
| T008 | Implemented | `tests/server.test.ts`, `tests/http-server.test.ts`, `tests/start-server.test.ts` | Signed event posts through dispatch and HTTP. |
| T009 | Implemented | `src/auth.ts`; `tests/auth.test.ts`, `tests/live-smoke.test.ts` | Per-event token closure; real mint is gated live smoke. |
| T010 | Implemented | `src/checks-client.ts`; `tests/server.test.ts` | Adapter routes only create/update through 014. |
| T011 | Implemented | `src/git-workspace.ts`; workspace tests | Ephemeral fetch/check out/dispose. |
| T012 | Implemented with architecture deviation | `src/github-api.ts`, `src/octokit-api.ts`; Octokit tests | Planned `gh-sources.ts` became a single narrow GitHub API port with paginated reads. |
| T013 | Implemented with live-edge additions | `src/server.ts`, `src/http-server.ts`, `src/bin.ts`, `src/index.ts`; HTTP/bin tests | Raw-body HTTP listener and concrete composition exist. |
| T014 | Implemented | `tests/auth.test.ts` | Token/private-key success and failure paths. |
| T015 | Implemented | `tests/secret-safety.test.ts` | Sentinel coverage across success and public failure paths. |
| T016 | Implemented | `src/config.ts`, `src/auth.ts`, `src/server.ts`, `src/http-server.ts` | No general credential logger exists; public diagnostics are fixed/allowlisted. |
| T017 | Implemented | `src/auth.ts`, `src/git-workspace.ts`, `src/http-server.ts`; secret tests | Errors are redacted or replaced at boundaries. |
| T018 | Implemented | `tests/server.test.ts`, `tests/http-server.test.ts`, `tests/start-server.test.ts` | 401/202/413 behavior and no dispatch/write. |
| T019 | Implemented | `tests/server.test.ts`, `tests/handler.test.ts`, workspace tests | Failed checkout/review is neutral and cleanup ownership is explicit. |
| T020 | Implemented | `src/server.ts`, `src/http-server.ts` | Signature/action/size/status mapping. |
| T021 | Implemented | 014 `safeRun`/`handleEvent`; server degradation tests | Incomplete reviews are neutral; workspaces dispose after checkout succeeds. |
| T021a | Implemented by 017 | `tests/concurrency-isolation.test.ts` | Two overlapping dispatches use distinct source roots, observe only their own identity, post both honest checks, and dispose both roots. |
| T022 | Implemented by 016 | `packages/github-app-server/README.md` | Run path, four variables, permissions, and safety boundary documented. |
| T023 | Implemented by 016 | `README.md`, `packages/cli/README.md` | Deployable self-hosted transport is documented without claiming a bundled binary. |
| T024 | Implemented / revalidated by 016 | Focused server test command | Result recorded in 016 verification. |
| T025 | Implemented / revalidated by 016 | Full test and typecheck commands | Result recorded in 016 verification. |
| T026 | Implemented / revalidated by 016 | 016 external review and final status | Only Checks writes, no secret/source persistence, no P5/P6 drift. |

## Acceptance scenario classification

| Claim | Class | Evidence and boundary |
|---|---|---|
| US1-AC1: running service receives a real opened PR and creates a live check | manual-operator | Automated socket/dispatch composition: `start-server.test.ts`; live token/check adapter: gated `live-smoke.test.ts`. A public GitHub webhook round-trip still requires the operator checklist. |
| US1-AC2: confirmed live diff yields failure at exact line | manual-operator | Real local scan/verdict: `real-review.test.ts`; real Checks write: gated live smoke. Their combination against api.github.com is manual. |
| US1-AC3: only checks writes | automated | `server.test.ts`, 014 safety/handler tests. |
| US2-AC1: no credential in any success/failure output | automated | `secret-safety.test.ts`, `auth.test.ts`, `git-workspace.test.ts`. |
| US2-AC2: missing credential fails fast without a value | automated | `config.test.ts`, `installation-id.test.ts`, `start-server.test.ts`. |
| US2-AC3: every emitted diagnostic is secret-safe | automated | Sentinel boundary tests, including HTTP 502 and unexpected 500. |
| US3-AC1: bad signature rejected before dispatch/write | automated | `server.test.ts`, `http-server.test.ts`. |
| US3-AC2: non-reviewable/unparseable event acknowledged without check | automated | `server.test.ts`, `degradation.test.ts`. |
| US3-AC3: incomplete review is neutral and workspace disposed | automated | `server.test.ts`, 014 handler disposal tests, workspace partial-cleanup tests. |

## Success-criterion classification

| Criterion | Class | Evidence and boundary |
|---|---|---|
| SC-001 real deployment produces a PR check | manual-operator | Requires registered App, public endpoint, and real delivery. |
| SC-002 live confirmed finding matches 014 at file/line | manual-operator | Local real-review and live adapter smoke are separate; full combination is manual. |
| SC-003 zero credential values | automated | Sentinel suite across success/error surfaces. |
| SC-004 Checks are the only writes | automated | Narrow API port, allowlist, and write-recording tests. |
| SC-005 zero source remains | automated | Real and fake workspace disposal tests. |
| SC-006 signature/action behavior | automated | Server/HTTP/degradation tests. |
| SC-007 incomplete never succeeds | automated | Neutral degradation tests for checkout, scan, and GitHub reads. |

## Gated live smoke: exactly what it proves

With `AKER_BUILD_SMOKE=1` and real operator-supplied environment values,
`tests/live-smoke.test.ts` proves:

1. real App/installation token minting;
2. real paginated PR-file reads;
3. a real neutral Checks-run create at the supplied head SHA.

It does **not** prove HMAC delivery through a public endpoint, private-repository git checkout with
that token, full scan/verdict/check composition, uninstall residue, or branch-protection behavior.
Those remain manual operator evidence. With the flag absent, all three tests report skipped and
certify nothing about live GitHub.
