# @aker-build/github-app-server

Self-hostable deployment runtime for the Aker Build report-only GitHub App (014). It hosts the webhook endpoint and supplies the concrete GitHub Checks client and ephemeral git workspace, so the App runs against live GitHub.

## What it does

On each accepted `pull_request` webhook: verify HMAC and event identity → reserve bounded capacity →
create or re-find an **in-progress Checks run** → return `202` → execute separate base/head
checkouts, snapshot comparison, and scan in a deadline-bound child worker → complete that same check
→ delete both workspaces and snapshots. It only reports; it never changes code or merge state.

## Configure (secrets via environment only)

```text
AKER_BUILD_APP_ID=<app id>
AKER_BUILD_APP_PRIVATE_KEY=<private key>     # never logged or written to disk
AKER_BUILD_WEBHOOK_SECRET=<webhook secret>   # never logged or written to disk
AKER_BUILD_INSTALLATION_ID=<installation id>
PORT=<optional>
```

Missing any required variable → the service **fails fast** at startup, naming the variable, **never printing its value**.

## GitHub App permissions

Configure exactly `metadata: read`, `contents: read`, `pull_requests: read`, and `checks: write`.
Subscribe only to the `pull_request` webhook. Do not grant contents-write, administration, merge, or
workflow-write permissions.

All queue, scan, Git, socket, cleanup, and delivery-cache settings have validated safe ranges. See
the [runtime operations guide](../../docs/operations/github-app-runtime.md) for the full environment
table, probes, TLS boundary, metrics, shutdown, and recovery procedures.

## Build and run

Build separate server and worker artifacts, then run the compiled server:

```bash
pnpm --filter @aker-build/github-app-server build
node packages/github-app-server/dist/server.mjs
```

Or build the non-root, read-only-compatible local container with
`deploy/github-app.compose.yml`. Terminate TLS upstream; the source runtime defaults to loopback and
the Compose example publishes only to host loopback.

## Verifiable safety boundary

- **Secrets never leak (Principle VII)**: credentials are read only from the environment; the per-event installation token is passed to the Git child through an allowlisted environment (never argv, remote URL, or `.git/config`) and discarded after the event. No credential value is allowed in logs, errors, Checks payloads, marker files, or metrics.
- **Report-only**: the only GitHub writes are `checks.create` / `checks.update`, routed through 014's `assertAllowedWrite` chokepoint.
- **Stateless**: no database; the queue/delivery cache are bounded in memory and each child gets a unique marked workspace removed after use.
- **Honest**: unsigned/forged webhooks are rejected; overflow is retryable; deadline, budget, crash, or incomplete work completes the existing check as `neutral`, never a false success.
- **Operable**: `/healthz`, `/readyz`, and bounded JSON `/metrics`; allowlisted structured logs; socket deadlines; graceful drain/termination; conservative stale cleanup.

## Architecture (what's built vs. supplied)

This package depends on a narrow `GitHubApi` **port** (read PR metadata; create/update/find check-run)
and a `GitRunner` port — both injectable. The implemented composition uses the concrete Octokit
adapter, installation-token authentication, real child-process Git runner, raw-body HTTP listener,
bounded queue, forked worker, and separate ephemeral base/head workspaces. Diff correctness comes
from those two webhook-SHA trees, not GitHub patch text. Unit/integration tests exercise real Octokit
request shapes via injected fetch and real Git via local `file://`; credential-gated public-host proof
remains an operator action.

## Not in this feature

- No org-level dashboard / aggregation (P5).
- No required/blocking merge check (P6) — only the repo owner's branch protection could make the check required.
- No serverless or multi-tenant hosting (single self-hosted instance).
