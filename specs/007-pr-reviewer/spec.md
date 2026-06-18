# Feature Specification: PR Reviewer

**Feature Branch**: `007-pr-reviewer`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "Review local diff and GitHub PR changes against scope and gates. Depends on 001, 002, 003, 004. Docs only; no production code."

**Depends on**: `001-product-foundation`, `002-project-map-schema`, `003-cli-scanner`, `004-saas-gates-v0`
**Blocks**: `008-github-action` (the Action runs this review in CI)

---

## Purpose *(mandatory)*

The PR Reviewer closes the loop: it evaluates a change (a local diff, or later a GitHub PR) against the
Project Map, the declared scope, and the SaaS gates, and returns a **Ready / Not Ready / Needs
Verification** verdict with evidence. Local-diff review works with no credentials, keeping the kernel
local-first; GitHub PR review is an additive capability.

This spec defines the **review inputs, verdict model, and evidence requirements** — not the diff-parsing
internals or language.

---

## Clarifications

### Session 2026-06-18

- Q: The 004 gates engine runs over the whole project-map (full-repo evidence), not a diff — how does "run the gates against the change" work without modifying 004? → A: Run the **full 004 gate set over current (post-change) repo state**, then **attribute each finding to the diff** by checking whether its evidence `path` is among the changed files. Reuses 004 verbatim; read-only; deterministic. Findings whose evidence touches no changed file are out of the diff's scope and do not drive the verdict.
- Q: 004 ships findings with `status` (risk / needs_verification / not_applicable) + `severity` but **no** "blocking gate" field — how is the verdict derived? → A: Map the verdict **off `status`**: a diff-attributable `risk` → **Not Ready**; a diff-attributable `needs_verification` → **Needs Verification**; otherwise **Ready**. **All `risk` findings block in v0** (a gate-ID subset refinement is a later concern). The earlier assumption that a "blocking vs informational" distinction was "refined alongside 004" is **retired** — it never shipped; severity is reporting detail, not the verdict driver.
- Q: `review-pr --local-diff` has no item reference, but FR-003 / User Story 3 check the diff against a queue item's allowed/forbidden files — how is scope resolved? → A: Add an **optional `--item <ID>`** flag. When given, the reviewer loads that item's `allowed_files`/`forbidden_files` from `queue.json` (005) and runs the scope check. **Without `--item`, the scope check is skipped (and noted in the report)**; gate-based review + verdict still run, preserving always-available local-first review (US1).
- Q: What output shape should the readiness report take? → A: Both forms — a **machine-readable `review.json`** (verdict + contributing findings + evidence) **and a human-readable Markdown report**, mirroring the risks.json/queue.json precedent. Printed to stdout and written to `.tenantguard/` (outside tracked source).

---

## User Scenarios & Testing *(mandatory)*

"User" is a reviewer (human or CI) checking whether a change is safe to merge.

### User Story 1 - Review a local diff (Priority: P1)

A reviewer runs the reviewer against the current local diff and gets a Ready / Not Ready / Needs
Verification verdict with evidence, with no GitHub credentials required.

**Why this priority**: Local-diff review is the local-first, always-available form of the capability —
the MVP headline. It verifies agent/human output against the same gates that shaped the task.

**Independent Test**: Run local-diff review on a repo with a deliberate boundary violation and confirm
the verdict is Not Ready, naming the violated gate and citing the evidence.

**Acceptance Scenarios**:

1. **Given** a local diff, **When** review runs, **Then** the output is exactly one of Ready / Not
   Ready / Needs Verification, with supporting evidence.
2. **Given** a diff that violates an architecture or security gate, **When** review runs, **Then** the
   verdict is Not Ready and names the failing gate.
3. **Given** insufficient evidence to judge a gate, **When** review runs, **Then** the relevant part of
   the verdict is Needs Verification, not a false pass.
4. **Given** local-diff review, **When** it runs, **Then** it requires no network access and no
   credentials.

### User Story 2 - Review a GitHub PR (Priority: P2)

A reviewer (or CI) reviews a specific GitHub PR by number and gets the same verdict model, incorporating
PR metadata and changed files.

**Why this priority**: PR review extends the same gates to the collaboration surface; it is additive and
GitHub-first per the principles.

**Independent Test**: Review a PR with a known migration-safety issue and confirm the verdict flags
TG-G3 with evidence drawn from the changed files / PR metadata.

**Acceptance Scenarios**:

1. **Given** a PR number, **When** review runs, **Then** it returns the Ready / Not Ready / Needs
   Verification verdict using PR metadata and changed files as evidence.
2. **Given** GitHub access is unavailable, **When** PR review is requested, **Then** it reports the
   access gap clearly and local-diff review remains available.

### User Story 3 - Review against declared scope (Priority: P2)

A reviewer checks a change against a queue item's declared allowed/forbidden files and flags
out-of-scope edits.

**Why this priority**: Scope adherence is how TenantGuard catches "agent changed too many files."

**Independent Test**: Review a diff that touches a forbidden file for its item (via `--item <ID>`) and
confirm the verdict flags the out-of-scope change.

**Acceptance Scenarios**:

1. **Given** `--item Q-001` whose diff touches a forbidden file, **When** review runs, **Then** the
   verdict is Not Ready and the out-of-scope change is flagged with evidence.
2. **Given** no `--item` flag, **When** local-diff review runs, **Then** the scope check is skipped, the
   report notes that no scope was checked, and gate-based review + verdict still run.

---

### Edge Cases

- **Empty diff**: returns a clean/with-nothing-to-review result, not an error.
- **Huge diff**: completes or reports progress; does not hang silently.
- **Insufficient evidence**: any unjudgeable gate yields Needs Verification, never a false pass.
- **Secret-like content in diff**: flagged as a finding; the secret value is never echoed in the report.
- **No GitHub access for PR mode**: reported clearly; local-diff mode still works.

---

## Verdict Model *(mandatory)*

```text
Ready              no diff-attributable risk findings and no scope violations; evidence supports merge-readiness
Not Ready          one or more diff-attributable risk findings or out-of-scope changes (with evidence)
Needs Verification no risk findings, but one or more diff-attributable needs_verification findings remain
```

**Verdict derivation (grounded in the shipped 004 `Finding`).** 004 emits findings with `status`
(`risk` / `needs_verification` / `not_applicable`) and `severity` — there is **no** "blocking gate"
field. The reviewer therefore derives the verdict **off `status`**, considering only findings
**attributable to the diff** (evidence `path` ∈ changed files) plus scope violations:

- Any diff-attributable `risk` finding **or** any out-of-scope change → **Not Ready** (all `risk`
  findings block in v0).
- Else, any diff-attributable `needs_verification` finding → **Needs Verification**.
- Else → **Ready**.

`severity` is reporting detail (it orders/annotates findings), not the verdict driver. The report MUST
attach, per contributing finding, the gate id, the location (evidence `path`/`line`), and the evidence.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The reviewer MUST review a local diff and return one of Ready / Not Ready / Needs
  Verification.
- **FR-002**: The reviewer MUST run the **full 004 gate set over current (post-change) repo state** and
  **attribute findings to the diff** by evidence `path` ∈ changed files; only diff-attributable findings
  drive the verdict, and the reviewer MUST attach evidence to each contributing finding. It MUST reuse
  the shipped 004 engine without modifying it.
- **FR-003**: When an **optional `--item <ID>`** is supplied, the reviewer MUST load that item's
  `allowed_files`/`forbidden_files` from `queue.json` (005) and flag out-of-scope edits (changed files
  outside `allowed_files` or inside `forbidden_files`). **Without `--item`, the scope check MUST be
  skipped and the report MUST note that no scope was checked** — gate review and the verdict still run.
- **FR-004**: Local-diff review MUST require no network access and no credentials.
- **FR-005**: The reviewer MUST support reviewing a GitHub PR by number, using PR metadata (number,
  title, state, base) and changed files as evidence (additive capability). **v0 assumption**: the gates
  inspect the local working tree, so the PR branch must be checked out locally; reviewing a fetched PR
  diff without a checkout is a later, additive capability.
- **FR-006**: When GitHub access is unavailable, PR review MUST report the gap clearly and MUST NOT
  block local-diff review.
- **FR-007**: Any check with insufficient evidence MUST yield Needs Verification, never a false pass.
- **FR-008**: The reviewer MUST be read-only — it MUST NOT modify the repo, the diff, or the PR
  (no comments, labels, commits, or merges in MVP).
- **FR-009**: The report MUST NOT contain secrets; secret-like content MUST be flagged, never echoed.
- **FR-010**: Review MUST be deterministic for unchanged input.
- **FR-011**: The reviewer MUST be domain-neutral — no Retail Tower/ERPNext/POS specifics.
- **FR-012**: The verdict MUST be derived **off finding `status`** (no "blocking gate" field exists in
  004): any diff-attributable `risk` or out-of-scope change → Not Ready; else any diff-attributable
  `needs_verification` → Needs Verification; else Ready. All `risk` findings block in v0; `severity` is
  reporting detail, not the verdict driver.
- **FR-013**: The reviewer MUST emit both a **machine-readable `review.json`** (verdict + contributing
  findings + evidence) and a **human-readable Markdown report**, printed to stdout and written to the
  designated out-dir (default `.tenantguard/`, outside tracked source).

### Key Entities

- **Review Run**: one evaluation of a change (local diff or PR), with an optional item id for scope.
- **Verdict**: Ready / Not Ready / Needs Verification, derived off finding `status`, with contributing
  (diff-attributable) findings.
- **Changed Files**: the set of file paths the diff touches; the join key used to attribute 004 findings
  to the diff (evidence `path` ∈ changed files).
- **Scope Check**: comparison of changed files against a queue item's `allowed_files`/`forbidden_files`
  (only when `--item` is supplied).
- **PR/diff Evidence**: changed files, hunks, and (for PRs) PR metadata.

---

## CLI Surface *(mandatory)*

```text
tenantguard review-pr --local-diff               review the current local diff (no credentials)
tenantguard review-pr --local-diff --item Q-001   ...and check scope against queue item Q-001
tenantguard review-pr <number>                    review a GitHub PR by number (requires GitHub access)
tenantguard review-pr <number> --item Q-001       ...with scope checked against Q-001
```

`--item <ID>` is **optional**; when supplied, the item's `allowed_files`/`forbidden_files` are read from
`<out>/queue.json` (default `.tenantguard/`) for the scope check. Without it, the scope check is skipped
(noted in the report) and gate-based review still runs.

---

## Required Outputs *(mandatory)*

```text
review.json             machine-readable: verdict (Ready/Not Ready/Needs Verification) + contributing
                        (diff-attributable) findings + evidence + scope result. Written to .tenantguard/.
PR / readiness report   human-readable Markdown of the same verdict + findings + evidence. Printed to
                        stdout and written to .tenantguard/. (008 surfaces this in CI.)
```

---

## Non-Goals *(mandatory)*

```text
- Posting PR comments, labels, or status checks (MVP review is read-only; the Action surfaces results — 008).
- Committing, pushing, or merging (never in MVP).
- Auto-fixing findings.
- Running the GitHub Action / CI wiring (that is 008).
- A full diff-aware static-analysis engine (gates are evidence-first, signal-based).
- Choosing a diff/GitHub-client library or language (decided at plan layer).
- Retail Tower / ERPNext / POS-specific review rules.
```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Local-diff review returns exactly one of Ready / Not Ready / Needs Verification in 100%
  of runs, with evidence.
- **SC-002**: A diff with a diff-attributable `risk` finding yields Not Ready naming the gate, in 100%
  of such cases on the sample set.
- **SC-003**: With `--item <ID>`, an out-of-scope edit (file outside `allowed_files` or inside
  `forbidden_files`) is flagged in 100% of such cases; without `--item`, the report notes scope was not
  checked.
- **SC-004**: Any unjudgeable check yields Needs Verification, never a false pass.
- **SC-005**: Local-diff review runs with no network access and no credentials.
- **SC-006**: Review is read-only — 100% of the repo/diff/PR is unmodified after a review.
- **SC-007**: 0 secrets appear in any review report; review is deterministic for unchanged input.

---

## Acceptance Criteria for This Feature *(mandatory)*

- **AC-001**: The verdict model (Ready / Not Ready / Needs Verification) is specified.
- **AC-002**: Gate-based review (full 004 set, diff-attributed by evidence `path`) with per-finding
  evidence and the status-based verdict mapping is specified.
- **AC-003**: Optional `--item`-driven scope (allowed/forbidden files) checking, and the skip-and-note
  behavior without `--item`, are specified.
- **AC-004**: Local-diff (no credentials) and GitHub-PR (additive) modes are specified.
- **AC-005**: Read-only, no-secrets, deterministic, domain-neutral guarantees are specified.
- **AC-006**: CLI surface (`review-pr --local-diff [--item]`, `review-pr <number> [--item]`) and the
  `review.json` + Markdown outputs are defined.
- **AC-007**: Non-goals are explicit (no PR comments/labels, no mutation, no CI wiring, library choice).
- **AC-008**: The spec is implementation-neutral on diff/GitHub-client library (deferred to plan).
- **AC-009**: No production code, reviewer code, `package.json`, or lockfile is created.

---

## Assumptions

- **Diff parsing and GitHub-client choice deferred** to plan/ADR. This spec mandates review *behavior
  and verdict model*, not the libraries.
- **GitHub access**, when used for PR mode, relies on the user's existing credentials/CLI; TenantGuard
  stores no tokens.
- **No "blocking gate" field in 004** (the earlier assumption that one was "refined alongside 004" never
  shipped). The verdict is derived off finding `status`; **all `risk` findings block in v0**. Narrowing
  to a gate-ID subset (e.g. G1–G4) is a later, additive refinement — never a change to 004.
- **004 reuse is verbatim**: 007 is an additive consumer of the shipped gate engine (as 005/006 were of
  their upstreams). It runs the gates over current repo state and attributes findings to the diff; it
  does **not** modify 004 or build a diff-native gate engine.
- **Local diff** means uncommitted/working changes and/or a stated base — exact diff base is a
  plan-layer detail.
- **Report formats** are human-readable + machine-readable, consistent with 001's required outputs.
