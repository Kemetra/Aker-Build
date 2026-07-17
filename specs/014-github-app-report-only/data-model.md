# Phase 1 Data Model: 014 Report-Only GitHub App

All entities are transient/in-memory unless stated. **Nothing in this model is persisted** — no datastore, no stored source, no stored secrets (FR-008/FR-009). Types are conceptual; the implementation uses Zod schemas at the boundary, consistent with the repo.

## Entity: WebhookEvent (inbound, transient)

The verified GitHub pull_request event the App reacts to.

| Field | Type | Notes |
|---|---|---|
| action | enum | `opened` \| `reopened` \| `synchronize` \| (others ignored) |
| repository | { owner, name } | identifies the target repo |
| pullNumber | integer | the PR |
| headSha | string | the ref to review (R5) |
| isDraft | boolean | drives neutral-conclusion override (FR-015) |
| installationId | string | used to obtain the Checks credential |

Validation: signature MUST be verified before the payload is parsed into this entity (R2). Unrecognized `action` values are dropped (no check produced) — not an error.

## Entity: ReviewRequest (derived, transient)

What the App hands to the existing `review-pr` chain.

| Field | Type | Notes |
|---|---|---|
| repoRoot/ref | string | resolved PR head (R5) |
| changedFiles | string[] | from the PR diff |
| config | AkerBuildConfig | loaded via existing defaults incl. 013 path scope |

Relationship: one WebhookEvent → at most one ReviewRequest. No request is created for ignored actions.

## Entity: Finding (reused, not redefined)

Produced by the existing engine; the App consumes it unchanged. Shown here for the fields the App reads.

| Field | Type | Notes |
|---|---|---|
| gate | string | e.g. TG-G4 |
| severity | enum | low \| medium \| high \| critical |
| confidence | enum | `confirmed` \| `suspected` (from P2; App does not assign it) |
| evidence | { file, line? } | the `file:line` span for annotation (FR-004) |
| message | string | secret-safe (no captured secret values, FR-009) |

The App MUST treat `confidence` as authoritative and MUST NOT recompute it (FR-013).

## Entity: CheckRun (output, the App's only write target)

The single artifact the App writes back to GitHub. Reuses the merged Checks renderer payload (PR #24).

| Field | Type | Notes |
|---|---|---|
| headSha | string | the commit the check is attached to |
| status | enum | queued \| in_progress \| completed |
| conclusion | enum | success \| neutral \| failure (mapping per R4) |
| summary | string | human-readable; carries overflow beyond 50 annotations (FR-006) |
| annotations | Annotation[] | ≤ 50 prominent (R3); confirmed-first |

State transitions:

```text
queued ──> in_progress ──> completed(conclusion)
                              ├─ success   : no findings, no scope violation, not draft
                              ├─ neutral   : suspected-only OR draft OR incomplete review
                              └─ failure   : ≥1 diff-attributable confirmed finding (non-draft)
```

Idempotency: on `synchronize` for the same `headSha`/PR, the App UPDATES the existing CheckRun rather than creating a duplicate (FR-012).

## Entity: Annotation (output, child of CheckRun)

| Field | Type | Notes |
|---|---|---|
| path | string | file (from Finding.evidence.file) |
| line | integer | from Finding.evidence.line |
| annotationLevel | enum | failure / warning / notice — derived from severity×confidence |
| message | string | secret-safe |
| presentation | enum | `prominent` (confirmed) \| `collapsed` (suspected) (FR-005) |

Constraint: at most 50 `prominent` annotations emitted per check; suspected findings render collapsed/low-emphasis and overflow is summarized in CheckRun.summary, not annotated line-by-line (FR-006/SC-005).

## Write-allowlist invariant (cross-cutting, FR-007/FR-014)

The ONLY GitHub write operations the App may perform are: create CheckRun, update CheckRun, attach Annotations. Any other write (commit, push, branch update, label, merge, review-request) is forbidden and MUST be unreachable in code — enforced by `safety.ts` and asserted in tests (SC-003).
