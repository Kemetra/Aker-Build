# @aker-build/github-app-server

Self-hostable deployment runtime for the Aker Build report-only GitHub App (014). It hosts the webhook endpoint and supplies the concrete GitHub Checks client and ephemeral git workspace, so the App runs against live GitHub.

## What it does

On each `pull_request` webhook: verify the HMAC signature → check out the PR head into an ephemeral dir → run the existing review → post a **Checks run + annotations** → delete the dir. It only reports; it never changes code or merge state.

## Configure (secrets via environment only)

```text
AKER_BUILD_APP_ID=<app id>
AKER_BUILD_APP_PRIVATE_KEY=<private key>     # never logged or written to disk
AKER_BUILD_WEBHOOK_SECRET=<webhook secret>   # never logged or written to disk
AKER_BUILD_INSTALLATION_ID=<installation id>
PORT=<optional>
```

Missing any required variable → the service **fails fast** at startup, naming the variable, **never printing its value**.

## Verifiable safety boundary

- **Secrets never leak (Principle VII)**: credentials are read only from the environment; the per-event installation token is passed to git as an in-memory `http.extraheader` (never written to `.git/config` or echoed in stderr) and discarded after the event. No credential value appears in any log, error, Checks payload, or file — exercised by `tests/secret-safety.test.ts` (sentinel scan through a throwing, auth-header-bearing API error) and `tests/git-workspace.test.ts` (token never in the remote URL).
- **Report-only**: the only GitHub writes are `checks.create` / `checks.update`, routed through 014's `assertAllowedWrite` chokepoint.
- **Stateless**: no database; each event's checkout is a unique temp dir, removed on dispose (and cleaned up even if checkout fails partway) — zero repository source remains on disk.
- **Honest**: unsigned/forged webhooks → 401, no processing; non-reviewable events → 202, no check; an incomplete review → a `neutral` check, never a false success; a Checks-API failure → 502 at the boundary, never an uncaught throw or a leak.

## Runtime status

The HTTP listener, installation-authenticated Octokit adapter, real Git runner, ephemeral workspace, installation-token minting, composition root, and thin host entrypoint are implemented. Start the source-first development runtime with:

```bash
pnpm dlx tsx packages/github-app-server/src/bin.ts
```

The required environment is `AKER_BUILD_APP_ID`, `AKER_BUILD_APP_PRIVATE_KEY`, `AKER_BUILD_WEBHOOK_SECRET`, and `AKER_BUILD_INSTALLATION_ID`; `PORT` defaults to `3000`. The server accepts signed webhook POST requests. Packaging a container/service definition is outside 015. Credentialed verification against api.github.com remains the explicit operator smoke in `specs/015-github-app-deployment/live-smoke-checklist.md`.

The runtime keeps narrow `GitHubApi` and `GitRunner` ports so its host composition can be tested locally without network access. Real-component tests cover Octokit request mapping, Git fetch/checkout, HTTP handling, secret safety, and review verdict wiring.

## Not in this feature

- No org-level dashboard / aggregation (P5).
- No required/blocking merge check (P6) — only the repo owner's branch protection could make the check required.
- No serverless or multi-tenant hosting (single self-hosted instance).
