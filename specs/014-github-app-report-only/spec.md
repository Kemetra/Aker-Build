# Feature Specification: Report-Only GitHub App

**Feature Branch**: `014-github-app-report-only`
**Created**: 2026-06-21
**Status**: Draft
**Input**: User description: "Report-only GitHub App for TenantGuard (roadmap P4, EXPAND phase). Installs on a repo and, on each pull request, runs the existing review-pr chain and posts findings back to the PR as a GitHub Checks run plus inline annotations using the file:line evidence spans from the P2 confidence model. Confidence tiers drive presentation: confirmed findings render as a failed/neutral check with detail; suspected findings render as collapsed advisory notes so the PR is not flooded. Constitution-safe and report-only: no commits, no pushes, no auto-merge, no auto-fix, no agent execution. Stateless by default: computes from source truth per-PR with no database and stores no source code or secrets. Productizes the existing report-only dogfood GitHub Action behavior as an installable App, and consumes the already-merged report-only GitHub Checks renderer."

## Clarifications

### Session 2026-06-21

- Q: What App distribution model should v1 target? → A: Self-hostable, single-tenant first — an org deploys its own App instance/runner; a public multi-tenant hosted App is deferred (closer to P5). This keeps the "no stored secrets / no stored source" posture trivially true and matches the dogfood Action's "runs in your own CI" trust model.
- Q: What is the readability bound for prominent inline annotations? → A: At most 50 prominent annotations per check (matching GitHub's per-request annotation limit); any overflow is summarized in the check body rather than annotated line-by-line.
- Q: How are draft pull requests handled? → A: Draft PRs ARE reviewed, but a `failure` conclusion is downgraded to `neutral` (drafts never show a blocking-looking red check); a clean draft may still be `success`. All other report-only rules apply.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See TenantGuard findings on a pull request without local setup (Priority: P1)

A developer opens a pull request on a repository where the TenantGuard App is installed. Without running any CLI locally or configuring a workflow file, they see a TenantGuard check appear on the PR. The check reports whether the diff introduces tenant-isolation, migration, contract, or other gate risks, with each finding pointing to the exact file and line. The reviewer reads the findings inline next to the code and decides what to do — the App never changes the code or the merge state.

**Why this priority**: This is the entire reason the App exists — putting trusted findings where review already happens, with zero per-repo setup friction. It is the smallest slice that delivers the EXPAND-phase value (reach) and is independently shippable. Without it, nothing else matters.

**Independent Test**: Install the App on a test repo, open a PR that introduces a known `confirmed` finding (e.g. a DB write with no tenant filter), and verify a Checks run appears reporting that finding at the correct `file:line`, with no change to the branch, commits, or merge button.

**Acceptance Scenarios**:

1. **Given** the App is installed on a repository, **When** a pull request is opened, **Then** a TenantGuard Checks run is created on that PR's head commit reporting the review outcome.
2. **Given** a pull request whose diff introduces a `confirmed` finding, **When** the App reviews it, **Then** the finding appears as an inline annotation at the evidence `file:line` and the check conclusion reflects that confirmed findings exist.
3. **Given** a pull request whose diff introduces no findings and no scope violations, **When** the App reviews it, **Then** the check concludes "ready" / success with a human-readable summary and no annotations.
4. **Given** any pull request, **When** the App finishes reviewing, **Then** no commit, push, branch update, label, merge, or code change is made by the App — it only creates/updates a check and its annotations.

---

### User Story 2 - Confidence tiers keep the PR readable, not flooded (Priority: P2)

A reviewer looks at a PR that has both high-certainty (`confirmed`) and heuristic (`suspected`) findings. The `confirmed` findings are surfaced prominently — they drive the check conclusion and appear as clear inline annotations. The `suspected` findings are present for transparency but rendered as low-emphasis, collapsed advisory notes so they do not bury the signal. The reviewer can trust that "the check failed" means something certain, not noise.

**Why this priority**: The roadmap's #1 adoption threat is false positives causing the tool to be muted. Tier-driven presentation is what makes the App's verdict believed. It depends on Story 1 (the check must exist first) but is essential for trust, hence P2.

**Independent Test**: Open a PR whose diff triggers one `confirmed` and several `suspected` findings; verify the check conclusion is driven by the confirmed finding, the confirmed finding is a prominent annotation, and the suspected findings appear only in a collapsed/secondary section — the PR is not flooded with inline annotations for suspected items.

**Acceptance Scenarios**:

1. **Given** a PR with at least one `confirmed` finding attributable to the diff, **When** the App reports, **Then** the check conclusion is non-success (failure or neutral) and confirmed findings are rendered with full detail.
2. **Given** a PR with only `suspected` findings, **When** the App reports, **Then** the check conclusion does not block the reviewer's perception of "certain risk" (rendered as advisory/neutral) and suspected findings are presented as collapsed/low-emphasis notes.
3. **Given** a PR with a large number of findings, **When** the App reports, **Then** the volume of prominent inline annotations stays bounded so the PR remains readable.

---

### User Story 3 - Install and trust the App's safety boundary (Priority: P3)

An engineering lead evaluating TenantGuard installs the App on an organization or repository and grants it the minimum access it needs to read code and write checks. They can read, from the App's documented permissions and behavior, that it can never write to their code, push, merge, or run agents — it only reads source at a PR ref and reports. They can uninstall it cleanly with no residue.

**Why this priority**: Adoption by the target buyer (platform/eng-lead) requires a legible, minimal, auditable safety posture. It is a precondition for org rollout but not for proving the core report-on-PR value, hence P3.

**Independent Test**: Review the App's requested permissions and confirm they are limited to reading repository contents/metadata and writing checks; verify via a full PR run that no write occurs outside the Checks API; uninstall and confirm no lingering state or stored code.

**Acceptance Scenarios**:

1. **Given** the App's permission set, **When** an installer reviews it, **Then** it requests only the access required to read source at a ref and to create/update checks and annotations — no contents-write, no merge, no workflow-write beyond what checks require.
2. **Given** a completed review, **When** the installer inspects what the App stored, **Then** no repository source code and no secrets are persisted by the App.
3. **Given** the App is uninstalled, **When** the installer checks the repository, **Then** no commits, branches, labels, or files were left behind by the App.

---

### Edge Cases

- **PR from a fork**: a PR opened from a fork may run with reduced permissions. The App MUST still produce a check where permitted and MUST degrade safely (clear, non-failing status explaining reduced capability) rather than erroring opaquely, and MUST NOT attempt any write it is not authorized for.
- **Diff too large / review times out**: the App MUST conclude with an honest non-error status indicating the review could not complete fully, rather than silently passing or hard-failing.
- **Repository is not analyzable** (e.g. unsupported structure, empty diff): the App MUST report a clear neutral status, consistent with the CLI's existing out-of-scope handling, not a crash.
- **Secret-like content encountered** in config or diff: the App MUST follow the existing secret-safety behavior — never capture, store, or print the secret value; report only that secret-like content was detected and where.
- **Re-run / synchronize**: when a PR receives new commits, the App MUST re-review the new head and update (not duplicate) its check.
- **App lacks the Checks permission** on a repo: the App MUST surface an actionable message about missing permission rather than failing silently.
- **No TenantGuard config present** in the repo: the App MUST run with documented defaults (consistent with the CLI), not refuse to run.
- **Draft pull request**: the App MUST review draft PRs under the same report-only rules, but MUST downgrade a `failure` conclusion to `neutral` so a work-in-progress draft never shows a blocking-looking red check (a clean draft may still conclude `success`).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The App MUST be installable on a GitHub repository or organization and, once installed, MUST react to pull request events (at minimum: opened, reopened, and updated/synchronized) without requiring any per-repo workflow file or local CLI invocation. v1 targets a self-hostable, single-tenant deployment (an org runs its own App instance/runner); a public multi-tenant hosted App is out of scope for this feature.
- **FR-002**: On a reviewable pull request event, the App MUST run the existing review-pr chain against the PR's changed files at the PR head ref, using the repository's source at that ref as the source of truth.
- **FR-003**: The App MUST report the review outcome as a GitHub Checks run associated with the PR head commit, with a conclusion that reflects whether diff-attributable `confirmed` findings exist.
- **FR-004**: The App MUST attach inline annotations for findings at the `file:line` evidence span provided by the confidence model, so findings appear next to the relevant code.
- **FR-005**: The App MUST present `confirmed` findings with full detail and a non-success (failure or neutral) conclusion, and MUST present `suspected` findings as collapsed/low-emphasis advisory notes that do not drive a blocking-looking conclusion.
- **FR-006**: The App MUST bound the number of prominent inline annotations to at most 50 per check (matching GitHub's per-request annotation limit), summarizing any overflow in the check body rather than annotating every line, so a PR with many findings stays readable.
- **FR-007**: The App MUST be report-only: it MUST NOT create commits, push, update branches, apply labels, merge, close, request changes as a review, modify code, or execute any AI agent. Its only repository-facing writes MUST be to the Checks/annotations surface.
- **FR-008**: The App MUST be stateless by default: it MUST compute results per-PR from source truth and MUST NOT persist repository source code or secrets in any store.
- **FR-009**: The App MUST never capture, store, or print secret values; when secret-like content is detected it MUST report only its presence and location, reusing the existing secret-safety behavior.
- **FR-010**: The App MUST request the minimum GitHub permissions required to read repository contents/metadata at a ref and to create/update checks and annotations, and MUST NOT request contents-write or merge permissions.
- **FR-011**: When the App cannot complete a review (timeout, oversized diff, reduced fork permissions, missing permission, unanalyzable repo), it MUST conclude with an honest, actionable non-error status and MUST NOT report a false "ready"/success.
- **FR-012**: On repeated events for the same PR, the App MUST update its existing check for that head rather than creating duplicate checks.
- **FR-013**: The App's reported findings, summary, and conclusion MUST be consistent with what the existing CLI `review-pr` and report output contract produce for the same diff, so the App is a faithful productization of the dogfood Action — not a divergent second judgment.
- **FR-014**: The App's behavior MUST be observable enough for an installer to verify the safety boundary — i.e. the set of write operations it performs is documented and limited to checks/annotations.
- **FR-015**: For a draft pull request, the App MUST still run the review and report findings, but MUST NOT conclude `failure` — a `failure` conclusion is downgraded to `neutral` so a work-in-progress draft never shows a blocking-looking red check. (A clean draft with no findings may still conclude `success`; the rule suppresses red, not green.)

### Key Entities *(include if feature involves data)*

- **Installation**: the association between the App and a repository or organization, carrying the granted permission scope. No source code or secrets are stored on it.
- **Pull Request Review Event**: the trigger — identifies the repository, the PR, and the head ref to review. Transient; not persisted beyond producing the check.
- **Check Run**: the App's primary output on a PR — a status (queued/in-progress/completed), a conclusion (success/neutral/failure), a human-readable summary, and a set of annotations. This reuses the already-built report-only Checks payload shape.
- **Finding Annotation**: a single reported risk tied to a `file:line` evidence span, a confidence tier (`confirmed`/`suspected`), a severity, and a message — rendered prominently or collapsed per its tier.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After installing the App on a repository, a reviewer sees a TenantGuard check on a newly opened pull request with zero additional per-repo configuration steps.
- **SC-002**: For a PR introducing a known `confirmed` finding, the finding is reported at its correct file and line on the PR in 100% of runs in the acceptance suite.
- **SC-003**: Across all acceptance runs, the App performs zero write operations to the repository other than creating/updating its check and annotations (verifiable: no commits, branches, labels, merges, or code changes attributable to the App).
- **SC-004**: Across all acceptance runs, the App persists zero bytes of repository source code and zero secret values.
- **SC-005**: For a PR with more than 50 findings, the number of prominent inline annotations never exceeds 50 and the remainder is summarized in the check body, so the PR remains reviewable.
- **SC-006**: For an identical diff, the App's conclusion and finding set match the CLI `review-pr` output for that diff (no divergent verdict).
- **SC-007**: When a review cannot complete, the App never reports "ready"/success; it reports an honest non-error status in 100% of the failure-mode acceptance cases.

## Assumptions

- The App productizes the existing report-only dogfood GitHub Action; it reuses the already-merged report-only GitHub Checks renderer payload shape and the existing `review-pr` / report output contract rather than introducing a new judgment engine.
- Confidence tiers and `file:line` evidence spans are supplied by the already-merged P2 confidence model; this feature consumes them, it does not redefine them.
- "Reviewable pull request events" are at least opened, reopened, and synchronized; draft PRs are reviewed under the same report-only rules but always conclude neutral (see Clarifications / FR-015).
- The App reads source at the PR head ref via GitHub's API/checkout mechanism; it does not require a hosted clone or persistent storage.
- Default configuration (when no `tenantguard` config is present) matches the CLI's documented defaults, including path-scope behavior from feature 013.
- v1 distribution is self-hostable and single-tenant (an org runs its own App instance/runner), per Clarifications; the specific runtime/host topology (where the webhook handler executes) is an implementation concern deferred to planning. A public multi-tenant hosted App is out of scope.
- This feature is roadmap P4 (EXPAND); it does NOT include org-level aggregation/dashboard (P5) or any enforcing/blocking-merge behavior (P6). Setting a check conclusion is reporting, not enforcement: GitHub branch-protection (configured by the repo owner, not the App) is the only thing that could make a check required, and that is explicitly out of scope here.
