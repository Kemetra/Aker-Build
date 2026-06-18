# Phase 0 Research: PR Reviewer

Decisions resolvable from the clarified spec, the constitution, ADR-001/002, and the shipped 003/004/005
packages (`@tenantguard/scanner`, `@tenantguard/gates`, `@tenantguard/queue`). Research inline (no
subagents). Format: **Decision / Rationale / Alternatives**.

---

## R1 — Diff source: shell out to `git diff --name-only` (resolves the one real unknown)

- **Decision**: Obtain the **changed-files set** by running `git` in the target repo:
  `git diff --name-only HEAD` for unstaged+staged working changes (default local-diff base), plus
  `git diff --name-only --cached` and untracked-file enumeration as needed, normalized to repo-relative
  POSIX paths. No third-party diff/patch-parsing library. Recorded as **ADR-006** (a 007 task, mirroring
  ADR-002/003/004/005).
- **Rationale**: 007 only needs the **set of changed file paths** to attribute 004 findings (evidence
  `path` ∈ changed files) and to run the scope check — it does **not** need hunk-level parsing in v0
  (the gates are evidence/signal-based, not line-diff-aware; "full diff-aware static-analysis engine" is
  a Non-Goal). `git` is already required (003/004 assume a Git repo via `isGitRepo`), runs locally with
  no credentials (FR-004, SC-005), and `--name-only` output is deterministic. The scanner exposes
  **no** diff capability today (only `isGitRepo` + read-only fs primitives), so a small read-only git
  runner is the minimal addition.
- **Alternatives considered**:
  - *A diff/patch-parsing dependency (e.g. `parse-diff`)* — adds a dependency and hunk machinery for
    data v0 doesn't consume. Revisit only if line-level attribution is ever required.
  - *Re-derive changed files from two project-map scans (before/after)* — needs a baseline checkout and
    state; strictly more complex with no v0 benefit. Rejected (see R3).

## R2 — Run the gates verbatim, attribute findings by evidence `path`

- **Decision**: Run the **full shipped 004 gate set over current (post-change) repo state** via
  `@tenantguard/gates` `runGates(target, { out })`, then keep only findings whose **evidence `path` is
  in the changed-files set** ("diff-attributable"). 004 is consumed **verbatim** — no new fields, no
  diff-native engine. 007 imports `Finding`/`RiskList` types and the `runGates` entry from
  `@tenantguard/gates`.
- **Rationale**: Mirrors the 005/006 additive-consumer pattern. Evidence `path` is the **only**
  per-finding location 004 exposes (`Finding` carries `gate_id`, `status`, `severity`, `evidence[]`;
  each evidence has `path`/`line?`), so set-membership on `path` is the only available attribution
  mechanism. Read-only, deterministic, and it honors CLAUDE.md "no broad refactors" + the constitution's
  No-Hidden-Mutation principle.
- **Alternatives considered**:
  - *Modify 004 to ingest a diff / add a "blocking" field* — violates "don't touch the shipped
    upstream" and "no broad refactors". Rejected (the clarify session retired the never-shipped
    "blocking gate" assumption precisely to avoid this).

## R3 — Verdict derivation off `status` (no before/after double-scan)

- **Decision**: From the diff-attributable findings + the optional scope result, derive the verdict:
  1. any diff-attributable `risk` **or** any out-of-scope change → **Not Ready**;
  2. else any diff-attributable `needs_verification` → **Needs Verification**;
  3. else → **Ready**.
  `severity` is reporting detail only. A single review of **current** state suffices — no baseline scan.
- **Rationale**: Matches FR-012 and the clarified Verdict Model exactly. A current-state-only review is
  simpler, needs no git stash/checkout, and stays read-only and deterministic. The "all risks block in
  v0" rule keeps the policy in 007 (not in 004); narrowing to a gate-ID subset is a later additive
  refinement.
- **Alternatives considered**:
  - *Severity-thresholded verdict (critical/high block)* — couples the verdict to severity; less
    predictable and not what the clarify chose. Rejected.

## R4 — Scope check: optional `--item`, read from `queue.json`

- **Decision**: When `--item <ID>` is supplied, load `queue.json` (005) from the out-dir, find the item
  by `id`, and compare the **changed files** against its `allowed_files`/`forbidden_files`: a changed
  file **inside `forbidden_files`** or **outside a non-empty `allowed_files`** is an out-of-scope
  finding. Without `--item`, **skip** the scope check and record a note in the report (gate review +
  verdict still run). Missing `queue.json` with `--item` → "run `tenantguard queue` first"; unknown
  `<ID>` → clear error. Reuses scanner read-only io and imports `QueueItem` from `@tenantguard/queue`.
- **Rationale**: Matches FR-003 and the clarified CLI surface. Keeping scope **optional** preserves the
  always-available local-first review (US1) — a bare `review-pr --local-diff` needs no queue. `allowed_files`
  empty (the 005 deriver may emit `[]`) means "no allow-list constraint", so only `forbidden_files`
  applies in that case (mirrors the 006 forbidden-empty handling).
- **Alternatives considered**:
  - *Always require `--item`* — breaks US1's no-credentials/no-queue headline. Rejected.
  - *Auto-detect a single ready item* — magical/ambiguous. Rejected.

## R5 — GitHub PR mode: additive, graceful-degrade, deferred client

- **Decision**: `review-pr <number>` is the **additive P2** path. v0 obtains PR changed files + metadata
  via the user's **existing `gh` CLI** (no stored tokens; FR-005, Assumptions). If `gh`/GitHub access is
  unavailable, report the gap clearly and exit non-zero **without blocking** local-diff mode (FR-006).
  The local-diff path (P1) is fully functional independent of PR mode. Choice of any richer GitHub
  client stays a plan-layer detail folded into ADR-006.
- **Rationale**: GitHub-first but local-first: PR mode reuses the same gate+verdict core over the PR's
  changed-files set; only the **diff source** differs (gh vs git). Graceful degradation satisfies FR-006
  and the constitution's CLI-First principle (no credential prerequisite for core value).
- **Alternatives considered**:
  - *Bundle Octokit / a GitHub App* — deferred per the constitution's technology baseline ("Octokit/
    GitHub App deferred until product pull"). Rejected for v0.

## R6 — Output: `review.json` + Markdown, mirroring risks.json/queue.json

- **Decision**: Emit a **machine-readable `review.json`** (verdict + contributing findings + evidence +
  scope result + mode) validated by a small **Zod** schema, and a **human-readable Markdown** report.
  Both printed to stdout / written to `.tenantguard/` (FR-013). Secret-like content is flagged, never
  echoed (FR-009) — inherited from upstream evidence which is already secret-safe.
- **Rationale**: Matches FR-013 and 001's human+machine output requirement; a validated `review.json`
  gives 008 (the Action) a stable verdict to parse. A Zod schema here (unlike 006, which emitted only
  Markdown) is warranted because `review.json` is a consumed JSON artifact.
- **Alternatives considered**: *JSON-only* (loses the human report 001 requires) / *Markdown-only*
  (008 can't parse a verdict). Both rejected.

## R7 — Determinism & read-only

- **Decision**: Fixed section order; changed-files and findings stably sorted by **code-unit string
  comparison** (not `localeCompare`) — the hard-won 004 determinism lesson, carried verbatim. No
  clock/random/locale. Same input → byte-identical `review.json` + Markdown (FR-010, SC-007). The
  reviewer is **read-only**: it runs `git diff`/`gh` (read commands), reads `queue.json`, and writes
  only under the out-dir — never the repo/diff/PR (FR-008, SC-006).
- **Rationale**: FR-010/SC-007 make reviews diffable and CI-stable; FR-008/SC-006 keep the kernel a
  trustworthy observer (No-Hidden-Mutation).
- **Alternatives considered**: *`localeCompare` sorting* — platform/locale-dependent ordering broke
  determinism in 004. Rejected.

## R8 — Fixtures

- **Decision**: Tests use the read-only fixture-prep pattern from 003/004 (copy-to-tempdir + `git init`,
  since a nested `.git` can't be committed). Fixtures: a repo+diff that triggers a `risk` finding on a
  changed file (Not Ready), a diff whose findings touch only unchanged files (Ready), a diff producing a
  `needs_verification` finding (Needs Verification), a diff touching a `forbidden_files` entry with
  `--item` (out-of-scope Not Ready), and a no-`--item` run (scope skipped + noted). The changed-files
  source and the gates run are unit-testable with injected/synthetic inputs to avoid a full chain run.
- **Rationale**: Covers SC-001…SC-007 + FR-006/FR-010 deterministically; upstream packages own their own
  fixtures, so 007 tests the **review** logic (attribution, verdict, scope, output), not re-derivation.
- **Alternatives considered**: *Only end-to-end via the full chain* — slower, conflates upstream
  derivation with review; keep a synthetic/unit layer.
