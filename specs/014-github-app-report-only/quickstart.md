# Quickstart: 014 Report-Only GitHub App

A reviewer/installer walkthrough. (Docs-only — describes intended behavior; the App is not implemented until 014 is approved.)

## What you get

Install once on a repo or org. Every pull request then shows a **Aker Build** check with findings at the exact `file:line`, with zero per-repo workflow files. The App only reports — it never changes your code or merge state.

## Install (self-hostable, single-tenant)

1. Deploy the App handler (self-hosted Node service or function) and register it as a GitHub App with **minimum** permissions:
   - `checks: write` (post the check + annotations)
   - `contents: read`, `metadata: read` (read source at the PR head ref)
   - **No** contents-write, **no** merge permission (FR-010).
2. Set the webhook secret; subscribe to `pull_request` events.
3. Install the App on the target repository or org.

## First PR

1. Open a PR. → A **Aker Build** check appears on the head commit (US1).
2. If the diff introduces a `confirmed` finding (e.g. a DB write with no tenant filter): the check concludes **failure**, and an inline annotation appears at the exact line (US1/US2).
3. `suspected` findings appear as collapsed advisory notes; the check stays **neutral** if there are no confirmed findings (US2).
4. A clean diff → **success** with a short summary, no annotations.
5. Push more commits → the **same** check updates in place (no duplicates, FR-012).

## Safety you can verify (US3)

- The App performs **no** commit, push, branch update, label, or merge — only the check + annotations (SC-003).
- Nothing is stored: no repository source bytes, no secret values (SC-004). Secret-like content is flagged, never captured (FR-009).
- A draft PR always shows a **neutral** check, never a blocking-looking red one (FR-015).
- Uninstall leaves no commits, branches, or files behind.

## Edge behavior (honest, never falsely green)

| Situation | What you see |
|---|---|
| PR from a fork (reduced perms) | A check where permitted, with a clear note about reduced capability — never a silent pass |
| Diff too large / review times out | **neutral** check with an honest "could not complete" message |
| >50 findings | the 50 most important annotated inline; the rest summarized in the check body |
| App missing the Checks permission | an actionable message about the missing permission, not silent failure |
| No `aker-build` config in repo | runs with documented CLI defaults (incl. 013 path scope) |

## Not in this feature

- No org-level dashboard / aggregation (that is roadmap P5).
- No required/blocking merge check (that is roadmap P6). The App sets a status; only the repo owner's branch-protection — configured by them, not the App — could make it required.
