# 018 Diff-Aware PR Review Implementation Plan

> **For agentic workers:** Execute inline task-by-task with RED/GREEN review gates. Do not dispatch
> subagents, commit, push, publish, mutate repository settings, or run credentialed live tests.

**Goal:** Replace changed-file attribution with one deterministic base/head comparison core consumed
by local CLI, CLI PR/Action, and the report-only App.

**Architecture:** Owned Git-archive snapshots feed scan/gates on both sides. A no-index zero-context
diff supplies head line ranges. A pure fingerprint/multiset classifier produces v2 review findings;
thin adapters supply refs/workspaces, and v1 remains accepted during migration.

**Tech stack:** TypeScript, Node fs/crypto/child_process, existing scanner/gates, Zod, Vitest, Git.

## Global constraints

- Preserve `findingId`, detector output, report-only App writes, and 017 budgets/containment.
- No new runtime dependency or lockfile change is expected.
- Git operations are read-only against user repos; all writes live under owned temporary/output dirs.
- Incomplete evidence is `needs_verification`, never ready.
- Every implementation task starts with a focused failing test.

## File map

- `packages/review/src/comparison.ts`: bounded fingerprinting, attribute direction, multiset pairing.
- `packages/review/src/diff.ts`: no-index diff invocation/parser and changed-line lookup.
- `packages/review/src/snapshot.ts`: ref resolution, archive/extract, local overlay, ownership cleanup.
- `packages/review/src/compare-review.ts`: analyze two trees and assemble the v2 report.
- `packages/review/src/{types,schema,verdict,render,checks,index}.ts`: v2/migration/output surfaces.
- `packages/review/src/{review,pr,gh,git}.ts`: local and CLI PR adapters.
- `packages/cli/src/{index,commands/review}.ts`: `--base` and OID threading.
- `packages/github-app/src/{types,review-runner,index}.ts`: base SHA and dual-checkout adapter.
- `packages/github-app-server/src/{worker-executor,server,octokit-api,github-api}.ts`: metadata/API seams.
- `.github/workflows/aker-build.yml`: full-history checkout for PR comparison.
- `packages/report/src/index.ts` and tests: v1/v2 review consumption.

## Task 1: v2 schema with v1 compatibility

**Tests:** `packages/review/tests/schema-v2.test.ts`, frozen v1 fixture.

- [ ] Write RED tests that v2 requires comparison metadata/classification and v1 remains accepted.
- [ ] Add exact v1/v2 types, closed enums, schemas, union validation, and schema version 2 producer.
- [ ] Export `AnyReviewReport` and type guards; update test helpers without changing judgment.
- [ ] Run `pnpm --filter @aker-build/review test -- schema-v2` and typecheck.

## Task 2: fingerprint and multiset classifier

**Tests:** `packages/review/tests/comparison.test.ts`.

- [ ] Add RED cases for unrelated edits, moved blocks, duplicate instances, resolved, severity/
  confidence/suppression/status direction, missing evidence, determinism, and no source in output.
- [ ] Implement bounded context digest and `findingFingerprint` without changing gate `findingId`.
- [ ] Implement deterministic grouped line-order pairing and closed classifications/directions.
- [ ] Run focused tests and the existing gate suppression suite.

## Task 3: owned snapshots and changed-line diff

**Tests:** `packages/review/tests/snapshot-real.test.ts`, `diff.test.ts`.

- [ ] Create real-Git RED fixtures proving HEAD/index remain byte-identical, explicit refs resolve,
  working/staged/untracked/deleted files materialize, and unsafe symlinks/submodules become incomplete.
- [ ] Add no-index diff RED cases for added/modified/deleted/binary files and malformed/failed output.
- [ ] Implement resolved-SHA archive/extract, contained overlay, cleanup handle, and fixed failures.
- [ ] Implement zero-context hunk parser with normalized paths/ranges and exit 0/1/>1 handling.
- [ ] Run focused real-Git tests on Windows and package typecheck.

## Task 4: shared comparison engine and verdict

**Tests:** `packages/review/tests/compare-review.test.ts`, verdict tests.

- [ ] Add RED end-to-end synthetic base/head analysis cases for every success criterion.
- [ ] Implement injected/default scan+gate analysis into separate temporary output dirs.
- [ ] Assemble v2 findings, comparison counts/ranges, scope findings, and completeness.
- [ ] Update verdict to use only new/worsened/unattributed plus scope/incompleteness.
- [ ] Run focused engine/verdict tests and existing review chain tests.

## Task 5: Markdown, Checks, and report migration

**Tests:** review render/checks tests and `packages/report/tests/report.test.ts`.

- [ ] Add RED output tests for introduced/debt/resolved sections, refs, summary-only advisories,
  changed-line-only annotations, v1 rendering, and v2 aggregate counts.
- [ ] Update renderers and keep deterministic 50-annotation cap/draft-neutral behavior.
- [ ] Update report loader/summary to consume v1/v2 without changing the report schema unnecessarily.
- [ ] Run review and report package tests/typechecks.

## Task 6: local CLI adapter

**Tests:** `packages/cli/tests/cli.review.test.ts`, review real-snapshot tests.

- [ ] Add RED CLI tests for default HEAD comparison, `--base`, invalid/missing ref, and no mutation.
- [ ] Thread `base` through `ReviewOptions` and CLI command wiring.
- [ ] Build base/head snapshots, compare, write v2, and map incomplete snapshots to exit-0
  needs-verification while invalid user refs remain exit 2.
- [ ] Run focused CLI/review tests.

## Task 7: CLI PR and Action adapter

**Tests:** review gh/pr and CLI PR tests; workflow contract.

- [ ] Add RED metadata tests for `baseRefOid`/`headRefOid` and missing local commit objects.
- [ ] Make CLI PR mode use those exact commits through the shared comparison core.
- [ ] Set Action checkout `fetch-depth: 0`; keep permissions/report-only behavior unchanged.
- [ ] Prove local and PR adapters yield identical classifications for identical refs.

## Task 8: App dual-checkout adapter and IPC

**Tests:** App webhook/handler tests; server intake/worker/workspace tests.

- [ ] Add RED webhook/IPC tests requiring validated base SHA and forbidding raw diff/source in IPC.
- [ ] Extend transient event/job metadata with `baseSha` and update fixed schemas.
- [ ] Checkout base and head separately, run the shared comparison, and dispose both on every path.
- [ ] Keep the initial/final check identity, draft override, budget, timeout, and closed-error behavior.
- [ ] Prove App and review-core classification parity with two real local refs.

## Task 9: documentation and verification

- [ ] Document v1-to-v2 migration, local `--base`, Action history, App base/head behavior, and gaps.
- [ ] Run focused review/CLI/App/server/report tests, then `pnpm test` and `pnpm typecheck`.
- [ ] Run first-run smoke, `pnpm audit --prod`, `git diff --check`, secret/scope scan, and external
  rejection review.
- [ ] Record hosted Action/App parity as pending until operator evidence exists.

## External rejection checklist

Reject if old debt can become new from filename-only attribution; duplicate instances collapse;
fingerprints expose source or change `findingId`; Git changes user repo state; unsafe paths escape
snapshot ownership; a missing side/diff can return ready; annotations land on unchanged lines; v1
inputs break without migration; adapters implement separate classification; App loses report-only/
017 safety; or any 019+ detector/coverage behavior enters the diff.
