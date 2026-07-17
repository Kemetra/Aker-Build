# ADR-012: 013 Config Path-Scope Enforcement — Post-Merge Coherence Disposition

- **Status**: Accepted (with follow-ups)
- **Date**: 2026-07-16
- **Deciders**: Aker Build maintainers
- **Context tasks**: W1 prove-it audit task 1 (`.superpowers/sdd/task-1-brief.md`), pre-dating the
  W2 benchmark work on branch `w2-prove-it-benchmark`.

## Status note

This ADR is a **post-merge coherence audit**, not a merge/amend/park gate. Feature
`013-config-path-scope-enforcement` was already merged into `main` before this audit began. The
audit's job is to determine whether the merged state is coherent and complete, and whether any
follow-up work is required — not whether to merge it.

## Context

013's history, reconstructed from `git log`:

1. `10133e9` "Implement spec kit adapter and config boundary" — the 011 config boundary (schema,
   `paths.include`/`paths.exclude` fields) lands, but path filtering is not yet wired into any
   consumer (config-only scaffold).
2. `4bc6ed0` "feat(013): config path scope enforcement WIP (rebased onto P1–P4)" — the 013
   implementation is committed to the working tree, rebased onto the merged P1–P4 fortify arc
   (commits `932be9b` P1, `4061589` P2, `8200b82` P3, `520a15a` P4).
2b. That commit was pushed to branch `013-config-path-scope-enforcement` and opened as draft PR #25.
3. `ab5a523` "feat(013): config path scope enforcement WIP (rebased onto P1–P4) (#25)" — **PR #25
   merged into `main` on 2026-06-21**. The PR title still says "WIP," and coherence with P1–P4 (in
   particular P2's `min_tier` config surface) was verified only as "typecheck clean, full test suite
   passes" — not reviewed for semantic coherence at merge time. That review is what this ADR
   performs.

Main has since advanced six commits past `ab5a523` (features 014 report-only GitHub App, 015
GitHub App server runtime; `cf9367e`..`0445ced`), none of which touch `packages/config`,
`packages/gates`, `packages/scanner`, or `packages/review`. The 013 merge is unaffected by that
drift.

## Five-question coherence checklist

### 1. Completeness — does 013 implement every task in its own `tasks.md`?

Source: `specs/013-config-path-scope-enforcement/tasks.md` (merged at `ab5a523`, unchanged since).

- Phase 1 (Source Truth), Phase 2 (Tests First), Phase 3 (Implementation): **all checked**
  (`tasks.md:9-27`, T001–T013).
- Phase 4 (Validation): **T014–T016 are unchecked** (`tasks.md:31-33`):
  ```
  - [ ] T014 Run focused package tests.
  - [ ] T015 Run `pnpm test` and `pnpm typecheck`.
  - [ ] T016 Final status confirms no forbidden surfaces or unrelated changes.
  ```
  Re-running these now (2026-07-16, on current `main`) shows the underlying work these tasks
  describe is in fact done and green — `pnpm typecheck` is clean across all 13 typechecked
  workspace packages, and the four 013-touched suites pass in full:
  `packages/config` (8/8), `packages/scanner` (42/42, including
  `packages/scanner/tests/config-paths.test.ts:8` "excludes files from scanner discovery"),
  `packages/gates` (34/34, including `packages/gates/tests/config-suppressions.test.ts:85`
  "does not emit findings for excluded paths" and `packages/gates/tests/min-tier.test.ts` 3/3),
  `packages/review` (53/53). A repo-wide `pnpm test` does fail, but only in
  `packages/github-app-server` (`tests/real-review.test.ts`), which shells out to `git commit` in a
  temp repo and fails locally on `fatal: failed to write commit object` / 1Password SSH-signing —
  a local machine/environment artifact of the unrelated 014/015 feature, not a 013 regression or a
  013-touched package.
  **Finding: the Phase 4 checkboxes were never ticked before merge — a bookkeeping gap in
  `tasks.md`, not a functional gap.** T016 in particular ("final status confirms no forbidden
  surfaces or unrelated changes") was never explicitly re-stated post-merge.

### 2. One config schema — does 013 share P2's schema file, or fork a second config surface?

Single shared schema. `packages/config/src/index.ts:30-66` (`akerBuildConfigSchema`) defines
`paths.include`/`paths.exclude` (`index.ts:39-45`, added by 013) in the same `z.object` as P2's
per-gate `min_tier` (`index.ts:56`, `gates[gateId].min_tier`). No second schema, no parallel
config loader: `loadConfig()` (`index.ts:137-151`) is the single read path both features go
through, and `packages/config/tests/config.test.ts` exercises both `paths` (`config.test.ts:136-155`,
"matches include and exclude path filters consistently") and `gates.*.suppressions` in the same
file. **Finding: one config schema — no fork.**

### 3. Composition — is path-scope × `min_tier` combined behavior defined and tested?

**Gap confirmed.** Grep across `packages/gates/tests/` for a test that sets both `paths.exclude`/
`paths.include` and `gates.*.min_tier` in the same config returns nothing:
`packages/gates/tests/config-suppressions.test.ts` covers suppressions and path-exclude
separately (the "does not emit findings for excluded paths" case at line 85 sets only `paths`, no
`gates`); `packages/gates/tests/min-tier.test.ts` covers `min_tier` in isolation with no `paths`
field at all (`min-tier.test.ts:24-27`, `41-44`, `56`). The code path is not ambiguous —
`buildContext()` filters the file list *before* gates run (`packages/gates/src/context.ts:41-51`),
so an excluded file's evidence can never reach `applyConfigToRisks()`'s `min_tier` check
(`packages/gates/src/suppressions.ts:36-45`) in the first place; the two features compose by
construction (path-scope acts upstream of gate execution, `min_tier` acts downstream on what gates
emit) — but this composition is asserted by reading the code, not by a test. **Finding: real test
gap, not a behavioral ambiguity.**

### 4. Suppression-audit invariant — does path-scope exclusion violate the audited-suppressions model?

**No violation, on inspection of both FR-007 and FR-008 (`specs/013-config-path-scope-enforcement/spec.md:22-23`), not FR-007 alone.**

Path-scope exclusion (`paths.exclude`) and gate suppression (`gates.*.suppressions`, `min_tier`)
are two different, intentionally different, models:

- **Suppression** (P2/011): a finding *is generated*, then annotated in place with a visible,
  audited `suppression` object (`id`, `reason`, `owner`, `matched_by`) — see
  `packages/gates/src/suppressions.ts:36-57`. The finding stays in `risks.json`, just marked.
- **Path-scope** (013): matches FR-007, "Excluded files must not create new findings, queue items,
  or review-attributable findings" (`spec.md:22`) — the file is filtered out *before* any gate
  runs, at `buildContext()`'s `listFiles`/`fileExists`/`readFileSafe` (`context.ts:44-50`) and at
  the scanner's `scopedListFiles` (`packages/scanner/src/scan.ts:22,26`). No finding is ever
  synthesized for that path, so there is nothing to attach an audit record to — this is by design,
  analogous to `.gitignore` (out of scope entirely), not analogous to suppression (in scope,
  marked-and-visible). `packages/gates/tests/config-suppressions.test.ts:85-96`'s test name ("does
  not emit findings for excluded paths") is exercising this intended behavior, not exposing a bug.

  The invariant that actually governs this is FR-008: "Do not hide configured suppressions
  silently; reporting remains responsible for showing configured filters and suppressions"
  (`spec.md:23`). This is satisfied: `packages/report/src/index.ts:92-113`
  (`summarizeConfig()`) echoes the active `config.paths.include`/`config.paths.exclude` into
  `aker-build-report.json`'s `config` block (`index.ts:101-102`) alongside
  `suppressions_configured`. An operator reading the report can always see which path scope was
  active — excluded findings don't vanish from the system's visible state, they're disclosed at
  the config-summary level rather than the per-finding level.

  Additionally, `packages/review/src/review.ts:52` and `packages/review/src/pr.ts:58` pass the
  **unfiltered** `changed` file list (not `scopedChanged`) into `ReviewReport.changed_files`, while
  only the attribution step (`diffAttributableFindings`, `review.ts:46`/`pr.ts:52`) and scope check
  use the path-filtered set. This means a changed file that is path-excluded still appears in the
  review report's `changed_files` list — it just can't produce an attributable finding or a scope
  violation. That is further evidence the review layer keeps excluded files visible rather than
  making them disappear without trace.

**Finding: no invariant violation. Path-scope and suppression are deliberately different
mechanisms for different jobs (out-of-scope vs. in-scope-but-annotated), and FR-008's
reporting-disclosure requirement — the actual anti-silent-drop guardrail for path-scope — is met.**

### 5. Rebase freshness

Moot, resolved by the merge. At merge time (`ab5a523`, 2026-06-21) the 013 branch was rebased onto
P1–P4 (`932be9b`..`520a15a`) and is now part of `main`'s own history
(`git merge-base --is-ancestor ab5a523 main` confirms ancestry). `main` has advanced six commits
since (`cf9367e`..`0445ced`, features 014/015), none touching the four 013-relevant packages
(`config`, `scanner`, `gates`, `review`) — so there is no freshness gap to close.

## Decision

**Accept as merged, with follow-ups.** The 013 implementation is architecturally coherent with
P1–P4 (single config schema, well-defined composition-by-construction, no suppression-audit
violation once FR-008's reporting-disclosure duty is accounted for), and its core suites are green
on current `main`. The PR title's "WIP" was accurate about task-list bookkeeping, not about
functional completeness. Concrete follow-up requirements for a future task (not blocking, not
urgent):

- Add a test in `packages/gates/tests/` that configures both `paths.exclude`/`paths.include` and a
  `gates.*.min_tier` in the same `aker-build.config.json`, asserting the documented
  composition (path-filtered-out files never reach the `min_tier` check; a file that passes the
  path filter is still subject to `min_tier`). Closes checklist item 3's test gap.
- Tick `specs/013-config-path-scope-enforcement/tasks.md` T014–T016 to reflect the validation that
  has, in substance, already passed (focused suites green, typecheck clean) — and note the
  pre-existing, unrelated `packages/github-app-server` local-environment test failure (1Password
  SSH-signing artifact in `tests/real-review.test.ts`) so it isn't mistaken for a 013 regression by
  a future reader of that checklist.
- Optional/low-priority: confirm intentionally that `ReviewReport.changed_files` should stay
  unfiltered (path-excluded files visible in the report) while attribution and scope use the
  filtered set — the current behavior is defensible (matches FR-008's disclosure spirit) but was
  not explicitly called out as a design decision in `specs/013-config-path-scope-enforcement/plan.md`.

No revert is warranted: no finding supports a real invariant violation.

## References

- `specs/013-config-path-scope-enforcement/spec.md`, `plan.md`, `tasks.md`
- `packages/config/src/index.ts:30-66,153-198`
- `packages/gates/src/context.ts:20-52`
- `packages/gates/src/suppressions.ts:7-58`
- `packages/scanner/src/scan.ts:14-37`
- `packages/review/src/review.ts:32-58`, `packages/review/src/pr.ts:34-59`
- `packages/report/src/index.ts:92-113`
- `packages/gates/tests/config-suppressions.test.ts`, `packages/gates/tests/min-tier.test.ts`
- `packages/scanner/tests/config-paths.test.ts`, `packages/config/tests/config.test.ts`
- Commits: `10133e9`, `4bc6ed0`, `ab5a523` (PR #25 merge), `main` at `0445ced`
