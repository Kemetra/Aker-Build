# Phase 1 Contracts: 014 Report-Only GitHub App

Two contracts define the App's boundaries: what it **accepts** (inbound webhook) and what it **emits** (Checks output). Both are validated with Zod at runtime, consistent with the repo's boundary-validation rule.

## Contract A — Inbound webhook intake

**Trigger**: GitHub `pull_request` webhook delivery.

**Preconditions (MUST hold before any processing):**
1. The `X-Hub-Signature-256` HMAC matches the configured secret (R2). On mismatch → respond 401, no processing, no check.
2. The event `action` is one of `opened`, `reopened`, `synchronize`. Otherwise → respond 204, no check (not an error).

**Accepted input shape (subset the App reads):**

```jsonc
{
  "action": "opened",                  // | reopened | synchronize
  "pull_request": {
    "number": 42,
    "draft": false,                    // true → forces neutral conclusion (FR-015)
    "head": { "sha": "<headSha>" }
  },
  "repository": { "owner": { "login": "org" }, "name": "repo" },
  "installation": { "id": 12345 }
}
```

**Postcondition**: exactly one CheckRun is created or updated for `(repo, headSha)`.

## Contract B — Checks output

**The App's ONLY write surface.** Emits a Checks run + annotations; nothing else (FR-007).

```jsonc
{
  "name": "Aker Build",
  "head_sha": "<headSha>",
  "status": "completed",
  "conclusion": "failure",             // success | neutral | failure  (R4 mapping)
  "output": {
    "title": "Aker Build review",
    "summary": "<human-readable; lists any findings beyond the 50 annotated>",
    "annotations": [
      {
        "path": "apps/api/admin.ts",
        "start_line": 12,
        "end_line": 12,
        "annotation_level": "failure", // failure | warning | notice
        "message": "<secret-safe message>"
      }
      // ... at most 50 (R3)
    ]
  }
}
```

**Conclusion mapping (normative):**

| Situation | conclusion |
|---|---|
| ≥1 diff-attributable `confirmed` finding, non-draft | `failure` |
| only `suspected` findings | `neutral` |
| no findings, no scope violation, non-draft | `success` |
| draft PR (any findings) | `neutral` (FR-015) |
| review could not complete (timeout / fork / missing perm / unanalyzable) | `neutral` + honest summary; **never** `success` (FR-011) |

**Invariants:**
- `annotations.length ≤ 50`; overflow summarized in `output.summary` (FR-006/SC-005).
- `confirmed` findings ordered before `suspected`; confirmed render prominent, suspected collapsed (FR-005).
- No annotation `message` contains a captured secret value (FR-009).
- No write request other than create/update check-run is ever issued (FR-007/SC-003) — verified by the `safety.ts` allowlist and tests.

## Consistency contract (cross-check)

For an identical diff, Contract B's `conclusion` and finding set MUST equal the CLI `review-pr` output for that diff (FR-013/SC-006). The App is a faithful transport, not a second judge — it reuses the merged Checks renderer (PR #24) rather than re-deriving presentation.
