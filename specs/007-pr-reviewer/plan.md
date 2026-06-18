# Implementation Plan: PR Reviewer

**Branch**: `007-pr-reviewer` | **Date**: 2026-06-18 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-pr-reviewer/spec.md`

## Summary

The review stage that closes the produce→route→prompt→**review** loop. A new package `packages/review`
evaluates a change — a **local diff** (P1) or a **GitHub PR** (P2) — against the shipped 004 SaaS gates
and an optional declared scope, and returns a **Ready / Not Ready / Needs Verification** verdict with
evidence. Output is a machine-readable `review.json` plus a human-readable Markdown report. v0 is
deterministic, read-only, local-first, secret-free, and domain-neutral. Exposed via `tenantguard
review-pr --local-diff [--item <ID>]` and `tenantguard review-pr <number> [--item <ID>]`.

**Technical approach** (decided at this plan layer; see research.md):

1. **Diff source = shell out to `git diff --name-only`** (no diff-parsing dependency), resolving the
   spec's deferred choice. v0 needs only the **changed-files set**, not hunks. Recorded as **ADR-006**
   (a 007 task, mirroring ADR-002/003/004/005). See Research R1.
2. **Gates reused verbatim**: run the **full 004 gate set over current repo state** via
   `@tenantguard/gates` `runGates`, then keep findings whose **evidence `path` ∈ changed files**
   ("diff-attributable"). 004 is **not** modified — no new fields, no diff-native engine. See R2.
3. **Verdict off `status`** (no "blocking gate" field exists in 004): any diff-attributable `risk` or
   out-of-scope change → Not Ready; else any diff-attributable `needs_verification` → Needs
   Verification; else Ready. **All `risk` findings block in v0.** A single current-state review suffices
   — no before/after double-scan. See R3.
4. **Optional `--item`** scope: with it, compare changed files to the queue item's `allowed_files`/
   `forbidden_files` (read from `queue.json`); without it, **skip + note**, preserving always-available
   local-first review (US1). See R4.
5. **PR mode is additive** via the user's existing `gh` CLI (no stored tokens); graceful-degrades when
   GitHub access is unavailable without blocking local-diff (FR-006). See R5.

**No production code is created by this plan.** Implementation begins only after `plan.md` + `tasks.md`
are reviewed (AC-009; constitution §Development Workflow).

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (per ADR-001).
**Primary Dependencies**: `@tenantguard/gates` (`runGates` + `Finding`/`RiskList` types — diff-attributed
  verbatim); `@tenantguard/queue` (`QueueItem` type + reading `queue.json` for `--item` scope);
  `@tenantguard/scanner` (read-only `io.ts` for the output write + `isGitRepo`); **Commander** (CLI,
  ADR-002); **Zod** (validate `review.json`, mirroring 002/004/005). **No diff/patch-parsing library**
  (changed files come from `git diff --name-only`); **no bundled GitHub client** (PR mode uses the user's
  `gh` CLI). A small read-only **git runner** (and a `gh` runner for PR mode) is the only new primitive.
**Storage**: Reads `queue.json` (read-only, only with `--item`) and invokes read-only `git`/`gh`
  commands. Writes `review.json` + `review.md` to the **designated out-dir outside tracked source**
  (default `./.tenantguard/`, FR-013).
**Testing**: Vitest. Fixtures = copy-to-tempdir + `git init` repos (003/004 pattern) with seeded diffs;
  the changed-files source and gate run are unit-testable with injected/synthetic inputs.
**Target Platform**: Local dev machine / CI runner; Node CLI. Local-diff needs no network; PR mode needs
  the user's `gh`/GitHub access.
**Project Type**: CLI tool + supporting library (monorepo packages).
**Performance Goals**: Review a typical diff in well under a second beyond the gate run; no throughput
  target.
**Constraints**: One of Ready/Not Ready/Needs Verification with evidence (FR-001, SC-001);
  diff-attributed gate findings (FR-002, SC-002); optional scope check (FR-003, SC-003); local-diff
  needs no network/credentials (FR-004, SC-005); insufficient evidence → Needs Verification, never a
  false pass (FR-007, SC-004); read-only (FR-008, SC-006); no secrets (FR-009, SC-007); deterministic
  (FR-010, SC-007); domain-neutral (FR-011); 004 reused verbatim (FR-002).
**Scale/Scope**: local-diff + GitHub-PR modes; one review per invocation; no PR comments, mutation,
  auto-fix, or CI wiring (Non-Goals — CI wiring is 008).

## Constitution Check

*GATE: Must pass before Phase 0. Re-check after Phase 1.* Against the 8 named principles.

| Principle | Relevance | Status |
|-----------|-----------|--------|
| I. Source Truth First | The review inspects **current** source evidence (the diff, the gates run over current state, `queue.json`); insufficient evidence yields **Needs Verification**, never an unverified pass (FR-007). | ✅ Pass |
| II. CLI First | Delivered as `tenantguard review-pr`; local-diff runs with no network/credentials (FR-004); PR mode is an additive, separately-degrading surface (FR-006). | ✅ Pass |
| III. Evidence-Based | Every contributing finding carries the gate id + evidence (`path`/`line`); scope violations name the offending file. No verdict without evidence. | ✅ Pass |
| IV. Spec-Compatible | Reviews any repo's diff; `--item` scope is optional, so no Spec-Kit/queue dependency is forced. | ✅ Pass |
| V. Agent Safety | The reviewer **verifies** agent/human output against the same gates that scoped the task — the back-half of the safety loop. | ✅ Pass |
| VI. No Hidden Mutation | **Read-only**: runs read-only `git`/`gh` commands, reads `queue.json`, writes only to the out-dir; never comments, labels, commits, pushes, or merges (FR-008). | ✅ Pass |
| VII. No Secrets | Secret-like content in a diff is flagged, never echoed in the report (FR-009, SC-007); upstream evidence is already secret-safe. | ✅ Pass |
| VIII. Clean Extraction | Generalized review logic only — no Retail Tower / ERPNext / POS specifics (FR-011). | ✅ Pass |

**No gate violations — no Complexity Tracking entries required.** Docs-first: this plan creates no
code; implementation waits on reviewed `plan.md` + `tasks.md`.

**Post-Phase-1 re-check:** the design (a `packages/review` consumer of 004/005/scanner + a thin CLI
command, a read-only git/gh runner, a Zod-validated `review.json`) introduces no new principle strain;
all eight remain ✅. No 004 modification is required by any artifact (the discriminating constraint).

## Project Structure

### Documentation (this feature)

```text
specs/007-pr-reviewer/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions (diff source, gate attribution, verdict, scope, PR mode, output, determinism)
├── data-model.md        # Phase 1 — Review entities, finding-attribution, verdict rule, review.json shape
├── quickstart.md        # Phase 1 — planned `review-pr` usage + acceptance mapping
├── contracts/
│   ├── review-cli.md        # Phase 1 — `review-pr` command contract (args, --item/--local-diff/<number>, exit codes, output)
│   └── review-json.md       # Phase 1 — review.json schema contract (verdict + findings + scope + mode)
├── checklists/
│   └── requirements.md   # (from /speckit-specify)
└── tasks.md             # Phase 2 — /speckit-tasks (NOT created here)
```

### Source Code (repository root) — PLANNED, not created by this command

```text
packages/review/             # PR reviewer + verdict engine (created at implementation time)
├── src/
│   ├── types.ts             # Verdict, ReviewFinding, ScopeResult, ReviewReport, ReviewMode, ReviewOptions
│   ├── schema.ts            # Zod schema for review.json + validateReview (REVIEW_SCHEMA_VERSION)
│   ├── git.ts               # read-only git runner: changedFiles(repoRoot, base?) → string[] (R1)
│   ├── gh.ts                # read-only gh runner: prChangedFiles(number) + prMetadata (R5); GitHubUnavailableError
│   ├── attribute.ts         # keep findings whose evidence.path ∈ changed files (diff-attribution, R2)
│   ├── scope.ts             # optional --item scope check vs allowed_files/forbidden_files (R4)
│   ├── verdict.ts           # status-based verdict rule (R3): risk/oos→NotReady; needs_verification→NeedsVerification; else Ready
│   ├── render.ts            # human-readable Markdown report from a ReviewReport
│   ├── review.ts            # orchestrate: changed files → runGates → attribute → scope → verdict → report
│   ├── io.ts                # read queue.json (via queue/scanner); write review.json + review.md to out-dir
│   └── index.ts             # public surface: reviewLocalDiff(opts) / reviewPr(number, opts) → ReviewReport
└── tests/
    ├── verdict-exhaustive.test.ts     # exactly one of Ready/NotReady/NeedsVerification (SC-001)
    ├── risk-blocks.test.ts            # diff-attributable risk → Not Ready naming the gate (SC-002)
    ├── attribution.test.ts            # findings on UNCHANGED files don't drive the verdict (R2)
    ├── needs-verification.test.ts     # unjudgeable → Needs Verification, never a false pass (SC-004)
    ├── scope-item.test.ts             # --item forbidden/out-of-allow flagged (SC-003)
    ├── scope-skipped.test.ts          # no --item → scope skipped + noted, gates still run (FR-003)
    ├── read-only.test.ts              # repo/diff unmodified after review (SC-006)
    ├── no-secrets.test.ts             # secret-like content flagged, never echoed (FR-009)
    ├── pr-degrade.test.ts             # GitHub unavailable → clear gap, local-diff still works (FR-006)
    └── determinism.test.ts            # same input → byte-identical review.json + md (SC-007)

packages/cli/                 # extend the existing tenantguard CLI (no new package)
├── src/commands/review.ts    # `tenantguard review-pr [--local-diff|<number>] [--item] [--out] [--stdout] [--format]`
└── tests/cli.review.test.ts  # local-diff + PR; exit codes; run-queue-first (with --item); unknown id; gh-unavailable
```

**Structure Decision**: A new `packages/review` library (git/gh source + attribution + scope + verdict +
render) plus a thin new command in the **existing** `packages/cli`. `packages/review` depends on
`@tenantguard/gates` (the gate run + `Finding` input), `@tenantguard/queue` (the `QueueItem` scope
input), and `@tenantguard/scanner` (read-only io + `isGitRepo`). A **Zod** schema validates
`review.json` (a consumed JSON artifact, unlike 006's Markdown-only output). This plan **does not
create** any of the above; the split is confirmable at `/speckit-tasks`.

## Complexity Tracking

> No Constitution Check violations. No entries required.
