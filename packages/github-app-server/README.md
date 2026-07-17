# @aker-build/github-app-server

Self-hostable deployment runtime for the Aker Build report-only GitHub App (014). It hosts the webhook endpoint and supplies the concrete GitHub Checks client and ephemeral git workspace, so the App runs against live GitHub.

## What it does

On each `pull_request` webhook: verify the HMAC signature → check out the PR head into an ephemeral dir → run the existing review → post a **Checks run + annotations** → delete the dir. It only reports; it never changes code or merge state.

## Configure (secrets via environment only)

```text
AKER_BUILD_APP_ID=<app id>
AKER_BUILD_APP_PRIVATE_KEY=<private key>     # never logged or written to disk
AKER_BUILD_WEBHOOK_SECRET=<webhook secret>   # never logged or written to disk
PORT=<optional>
```

Missing any required variable → the service **fails fast** at startup, naming the variable, **never printing its value**.

## Verifiable safety boundary

- **Secrets never leak (Principle VII)**: credentials are read only from the environment; the per-event installation token is passed to git as an in-memory `http.extraheader` (never written to `.git/config` or echoed in stderr) and discarded after the event. No credential value appears in any log, error, Checks payload, or file — exercised by `tests/secret-safety.test.ts` (sentinel scan through a throwing, auth-header-bearing API error) and `tests/git-workspace.test.ts` (token never in the remote URL).
- **Report-only**: the only GitHub writes are `checks.create` / `checks.update`, routed through 014's `assertAllowedWrite` chokepoint.
- **Stateless**: no database; each event's checkout is a unique temp dir, removed on dispose (and cleaned up even if checkout fails partway) — zero repository source remains on disk.
- **Honest**: unsigned/forged webhooks → 401, no processing; non-reviewable events → 202, no check; an incomplete review → a `neutral` check, never a false success; a Checks-API failure → 502 at the boundary, never an uncaught throw or a leak.

## Architecture (what's built vs. supplied)

This package depends on a narrow `GitHubApi` **port** (read changed files / PR metadata; create/update/find check-run) and a `GitRunner` port — both injectable, so the runtime is fully tested without a network or live git. The concrete **octokit adapter** (`GitHubApi`) and a real `GitRunner` (shelling to `git`) are the thin deployment wiring an operator supplies; the install/token-minting flow (`authToken`) uses the standard GitHub App installation-token exchange.

> Status: the host logic, dispatch, Checks-client adapter shape, and ephemeral workspace are implemented and tested against fakes + a recording git runner. A production entrypoint that binds an HTTP listener and a live octokit `GitHubApi` is the remaining wiring (kept thin and out of the tested core deliberately).

## Not in this feature

- No org-level dashboard / aggregation (P5).
- No required/blocking merge check (P6) — only the repo owner's branch protection could make the check required.
- No serverless or multi-tenant hosting (single self-hosted instance).
