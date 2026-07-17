# @aker-build/github-app

Report-only GitHub App (roadmap **P4**). On a pull request, it runs the existing Aker Build `review-pr` chain at the PR head and posts the result as a **GitHub Checks run + annotations**. It never changes your code or merge state.

## Safety boundary (verifiable)

This package is **report-only** by construction:

- **Only write surface**: creating/updating a Checks run. Every GitHub write routes through `assertAllowedWrite()` in `src/safety.ts`, whose allowlist is exactly `checks.create` + `checks.update`. Any other operation (commit, push, merge, label, review-request, file write) throws `ForbiddenWriteError`. A Checks status is not a repository mutation — so Principle VI (No Hidden Mutation) holds.
- **Stateless**: each event checks out the PR head into an ephemeral workspace, runs the review, and **disposes** the workspace (`src/review-runner.ts`). No repository source is persisted across events.
- **Secret-safe**: reuses the engine's existing secret handling — secret-like content is flagged, never captured or printed.

## Minimum GitHub App permissions

Request only:

| Permission | Why |
|---|---|
| `checks: write` | post the Checks run + annotations |
| `contents: read` | read source at the PR head ref |
| `metadata: read` | required baseline |

Do **not** grant `contents: write` or any merge permission — the App neither needs nor uses them.

Webhook: subscribe to `pull_request` events; set a webhook secret (verified via HMAC, `src/webhook.ts`).

## Behavior

| Situation | Conclusion |
|---|---|
| ≥1 diff-attributable `confirmed` finding (non-draft) | `failure` |
| only `suspected` / needs-verification | `neutral` |
| no findings, no scope violation (non-draft) | `success` |
| draft PR (any findings) | `neutral` (never a blocking-looking red check) |
| review could not complete (fork / timeout / unavailable) | `neutral` + honest message — never a false `success` |

Annotations are capped at 50 per check (GitHub's per-request limit); overflow is summarized in the check body. The verdict and findings come entirely from the shared `review-pr` engine — the App does not re-judge.

## Out of scope

- No org-level dashboard / aggregation (roadmap P5).
- No enforcing / blocking-merge behavior (roadmap P6). The App sets a status; only a repo owner's branch protection — configured by them, not the App — could make it required.

## Architecture note

The merged Checks renderer (`renderChecksPayload` in `@aker-build/review`, PR #24) already produces the payload (annotation cap, tier→level, verdict→conclusion). This package is a thin **transport**: webhook intake → ephemeral checkout → run `review-pr` → draft-neutral override → post via the safety allowlist. It deliberately reuses, rather than re-implements, the presentation layer.
