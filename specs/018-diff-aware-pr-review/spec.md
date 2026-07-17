# Feature Specification: Diff-Aware PR Review

**Feature**: `018-diff-aware-pr-review`
**Created**: 2026-07-17
**Status**: Approved after owner-delegated external review
**Program**: `docs/superpowers/specs/2026-07-17-production-trust-and-expansion-program-design.md`

## Purpose

Make review verdicts describe what a change introduced. Findings that already existed at the base
must remain visible as debt without blocking an otherwise clean change. New or worsened findings,
resolved findings, changed-line attribution, and incomplete comparisons must be explicit and shared
by the CLI, Action, and report-only App.

018 changes comparison and output contracts only. It does not add detectors, change upstream gate
judgment, alter suppression IDs, enforce merges, mutate repositories, or add hosted surfaces.

## Chosen approach

The reviewed approach rescans two owned source snapshots and compares their gate results as
multisets. Filename-only attribution is rejected because an unrelated edit makes old debt appear
new. Git-blame/history heuristics are rejected because they do not cover untracked work and create
different semantics for the App. GitHub patch text is not the source of truth because large/binary
patches can be absent or truncated.

Local committed sources are materialized with `git archive` into owned OS-temporary directories.
The working-tree head is an archived `HEAD` snapshot with the validated changed paths overlaid from
the worktree. CLI PR mode archives API-provided base/head OIDs from the local checkout. App mode
checks out both webhook-provided SHAs into separate managed workspaces, then archives each checkout's
`HEAD`. Tree comparison uses read-only `git diff --no-index --unified=0`; exit 0 means equal, exit 1
means differences, and any other result is incomplete.

No command changes HEAD, index, refs, branch, worktree metadata, or source files. Temporary snapshots,
archives, and analysis outputs are owned, contained, and removed in `finally` paths.

## Data contracts

```ts
type FindingClassification = "new" | "existing" | "resolved" | "changed" | "unattributed";
type FindingChange = "worsened" | "improved" | "modified";
type ComparisonIncompleteReason =
  | "base_unavailable"
  | "head_unavailable"
  | "diff_unavailable"
  | "unsafe_path"
  | "submodule_unsupported"
  | "lfs_unsupported";

interface ChangedLineRange { start: number; end: number }
interface ChangedFile { path: string; ranges: ChangedLineRange[]; binary: boolean }
interface ComparisonRef { label: string; sha: string | null }
```

The producer emits `review.json` schema version 2. It adds comparison refs/completeness, changed-line
ranges, classification counts, and comparison fields on gate findings. Scope findings remain their
existing union member. The validator accepts frozen v1 fixtures and v2 documents; all new producers
emit v2. Markdown, Checks, and the aggregate report consume both during migration.

## Finding identity and pairing

- Preserve `findingId(finding)` exactly for config/suppression compatibility.
- `findingFingerprint` is comparison-only: SHA-256 over gate ID, normalized evidence path, evidence
  signal, and a SHA-256 digest of at most five normalized source lines centered on the primary
  evidence line. Source text is never emitted. Each source line is capped before hashing.
- Status, line number, severity, confidence tier, and suppression are attributes, not fingerprint
  fields. Moving an unchanged block therefore retains identity.
- Compare groups as multisets. Sort equal-fingerprint instances by evidence line and pair in relative
  order. Extra head instances are new; extra base instances are resolved.
- Paired instances with equal material attributes are existing. A status, severity, confidence, or
  suppression change is `changed` and receives `worsened`, `improved`, or `modified` direction.
- A new/worsened head finding that cannot intersect an added/modified line is `unattributed`. It is
  visible and yields needs-verification, never a false introduced failure.

## Verdict and presentation

- New or worsened, unsuppressed confirmed risk: `not_ready`.
- New or worsened suspected risk or needs-verification: `needs_verification` unless already not ready.
- Unattributed head finding: `needs_verification`.
- Existing findings: debt section/count only; never block by themselves.
- Resolved and improved findings: positive section/count; never block.
- Scope violations retain the current `not_ready` behavior.
- Any incomplete base, head, or diff forces `needs_verification`; it can never produce ready.
- Checks annotations are emitted only for new/worsened findings whose primary evidence line
  intersects a changed range, plus existing scope annotations. Path-level advisories are summary-only.
- Draft PR override remains neutral even when the comparison verdict is not ready.

## Functional requirements

- **FR-001**: Produce deterministic base/head snapshots without mutating the user repository.
- **FR-002**: Resolve every user/API ref to a full commit SHA before archive use and pass option
  separators to Git commands.
- **FR-003**: Validate every overlaid/diff path as normalized, relative, contained, and non-symlinked.
- **FR-004**: Detect submodule/LFS snapshot ambiguity and return a closed incomplete reason.
- **FR-005**: Derive changed files and added/modified head ranges from one tree comparison.
- **FR-006**: Treat untracked local files as all-added and deleted files as no head ranges.
- **FR-007**: Bound fingerprint source context and emit only digests, never source text.
- **FR-008**: Preserve upstream `findingId` and gate findings; comparison does not re-judge detectors.
- **FR-009**: Pair equal fingerprints as multisets without collapsing duplicate statements.
- **FR-010**: Classify new, existing, resolved, materially changed, and unattributed findings.
- **FR-011**: Apply the fixed worsening/improvement ordering to status, confidence, severity, and
  suppression changes.
- **FR-012**: Decide verdict only from new/worsened/unattributed findings, scope, and completeness.
- **FR-013**: Emit v2 with exact comparison refs, completeness, ranges, counts, and classifications.
- **FR-014**: Continue validating frozen v1 review fixtures and render v1 during migration.
- **FR-015**: Annotate only an actual changed head line; cap and sort annotations as before.
- **FR-016**: Add CLI `--base <ref>` for local mode. Without it, working/staged/untracked changes
  compare against `HEAD`.
- **FR-017**: CLI PR mode reads `baseRefOid`/`headRefOid`; missing local objects produce an incomplete
  needs-verification report, not ready.
- **FR-018**: Action checkout supplies full history required by CLI PR comparison.
- **FR-019**: Webhook validation requires `pull_request.base.sha`; base/head SHAs cross IPC only as
  validated metadata.
- **FR-020**: App processing uses two distinct managed checkouts and always disposes both.
- **FR-021**: App, CLI PR, Action, and local adapters call the same comparison/classification core.
- **FR-022**: Report package validates v1/v2 review input and summarizes v2 classification counts.
- **FR-023**: Comparison failures expose only closed reasons; arbitrary Git/fs errors are not public.
- **FR-024**: Preserve Checks-only App behavior and all 017 runtime budgets/containment.
- **FR-025**: No detector, Project Map, enforcement, mutation, P5/P6, or 019+ coverage change.

## Success criteria

- **SC-001**: Unrelated edit beside old debt remains existing and does not block.
- **SC-002**: Introduced confirmed risk on an added line is new, not ready, and inline annotated.
- **SC-003**: Moving an unchanged risky block remains existing.
- **SC-004**: A second identical risky statement yields one existing plus one new instance.
- **SC-005**: Removing a finding yields resolved.
- **SC-006**: Worsening attributes is visible and contributes; improvement does not block.
- **SC-007**: Base/head/diff incompleteness yields needs verification.
- **SC-008**: Identical comparison inputs produce identical classification across every adapter.
- **SC-009**: Frozen v1 fixtures remain accepted and v2 aggregate-report consumption passes.
- **SC-010**: Full tests, typecheck, first-run smoke, production audit, and external diff review pass.

## Evidence boundary

Local tests can prove snapshot immutability, classification, schema migration, and adapter parity over
controlled refs. Hosted Action and registered-App runs are separate operator evidence and must not be
claimed from local tests.
