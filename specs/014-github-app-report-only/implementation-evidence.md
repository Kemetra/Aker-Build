# 014 Implementation Evidence

**Reconciled**: 2026-07-17 under 016 external review
**Product status**: Implemented, with the explicitly unchecked gaps below
**Evidence rule**: A checked task needs a named implementation, test, document, or validation. A
partial or superseded task remains unchecked even when the larger feature is usable.

## Task traceability

| Task | Status | Evidence | Review note |
|---|---|---|---|
| T001 | Implemented | Historical branch scope; `specs/014-github-app-report-only/plan.md` | Package changes stayed inside approved App/docs scope. |
| T002 | Implemented | `packages/github-app/package.json`, `tsconfig.json`, `vitest.config.ts` | Workspace package exists. |
| T003 | Superseded / unchecked | `packages/github-app/package.json` | Review/config are direct dependencies; the planned direct `@aker-build/report` dependency was correctly omitted as unused because the review package owns the Checks renderer. Exact task was not performed. |
| T004 | Implemented | `packages/github-app/src/types.ts`; `tests/webhook.test.ts` | Zod validates the consumed webhook boundary; Checks payload is re-exported from the canonical review contract instead of duplicated. |
| T005 | Implemented | `src/safety.ts` | Allowlist is exactly create/update check. |
| T006 | Implemented | `tests/safety.test.ts` | Forbidden operations are rejected. |
| T007 | Implemented | `tests/webhook.test.ts` | Signature and opened/reopened/synchronize/ignored-action behavior. |
| T008 | Implemented with test-file deviation | `tests/handler.test.ts` (`handleEvent end-to-end`) | Runner seam is covered in the consolidated handler suite rather than a separate `review-runner.test.ts`. |
| T009 | Implemented with test-file deviation | `tests/handler.test.ts` (`buildPayload`) | Confirmed finding maps to failure and exact file/line. |
| T010 | Implemented | `src/webhook.ts`; `tests/webhook.test.ts` | HMAC verification precedes parsing/action filtering. |
| T011 | Implemented | `src/review-runner.ts`; `tests/handler.test.ts` | Shared review engine over ephemeral workspace with disposal. |
| T012 | Implemented | `src/checks.ts`, `src/safety.ts`; `tests/handler.test.ts` | Canonical renderer plus allowlisted writes. |
| T013 | Implemented | `src/index.ts`; `tests/handler.test.ts` | Verified-event handler wires run, payload, and check post. |
| T014 | Incomplete / unchecked | `packages/review/tests/checks.test.ts` | Suspected findings are warnings and neutral, but there is no proof of the planned collapsed/non-inline presentation. |
| T015 | Incomplete / unchecked | `packages/review/src/checks.ts`; `packages/review/tests/checks.test.ts` | Cap and overflow are implemented; confirmed-first ordering is not (current ordering is path/line/title). |
| T016 | Implemented | `tests/handler.test.ts` | Draft failure is neutral; clean draft remains success. |
| T017 | Incomplete / unchecked | `packages/review/src/checks.ts` | Tier levels/conclusion exist, but the planned collapsed suspected presentation does not. |
| T018 | Incomplete / unchecked | `packages/review/src/checks.ts` | Annotation cap/overflow exists; confirmed-first ordering remains absent. |
| T019 | Implemented | `src/checks.ts`; `tests/handler.test.ts` | Draft override is applied after canonical rendering. |
| T020 | Incomplete / unchecked | `tests/handler.test.ts`; `packages/review/tests/pr-degrade.test.ts` | Generic incomplete/timeout degradation is proven; the planned explicit fork and missing-permission matrix is not fully covered in this package. |
| T021 | Implemented | `tests/handler.test.ts`, `packages/review/tests/no-secrets.test.ts` | Workspace disposal and secret-safe shared-engine behavior are covered; no store exists. |
| T022 | Implemented | `tests/handler.test.ts` (`postCheck`) | Existing head updates instead of duplicate create. |
| T023 | Incomplete / unchecked | Shared `reviewPr` call in `src/review-runner.ts` | Architecture guarantees one engine, but the planned explicit App-vs-CLI parity test for the same diff is absent. |
| T024 | Implemented | `src/review-runner.ts` (`safeRun`), `src/index.ts` (`incompletePayload`) | Incomplete review maps neutral, never success. |
| T025 | Implemented | `src/checks.ts`; `tests/handler.test.ts` | Find-or-update behavior. |
| T026 | Implemented by 016 | `packages/github-app/README.md` | Canonical permissions and write allowlist documented. |
| T027 | Implemented by 016 | `README.md`, `packages/cli/README.md` | App surface documented as self-hostable and report-only. |
| T028 | Implemented / revalidated by 016 | `pnpm --filter @aker-build/github-app test` | Focused result recorded in 016 verification. |
| T029 | Implemented / revalidated by 016 | `pnpm test`; `pnpm typecheck` | Full result recorded in 016 verification. |
| T030 | Implemented / revalidated by 016 | 016 external diff review and final status | No mutation, persistence, P5/P6, manifest, or lockfile drift. |

## Open gaps routed forward

- T014/T017 suspected-presentation semantics and T015/T018 confirmed-first ordering affect review
  presentation and belong with 018's review-contract work.
- T020's network-specific degraded-path matrix belongs with 017 runtime fortification.
- T023's explicit App/CLI same-diff parity test belongs with 018, where base/head semantics change.
- T003 stays superseded: adding an unused direct dependency would weaken, not improve, the package.

These gaps are not silently converted to completed tasks and do not authorize implementation inside
016.
