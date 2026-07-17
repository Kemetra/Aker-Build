# GitHub App Runtime Operations

This guide operates the self-hosted, single-tenant, report-only Aker Build GitHub App. The service
accepts only signed `pull_request` deliveries for one configured installation and writes only GitHub
Checks create/update calls. It never changes repository content, branch protection, or merge state.

## Runtime model

For an accepted delivery the HTTP process verifies HMAC and headers, validates the event (including
both base and head commit SHAs) and installation, deduplicates the delivery UUID, reserves bounded
capacity, and establishes one `in_progress` check. It returns `202` before activating checkout or
scanning. Repository work then runs in a child process with scan, Git, and whole-job deadlines. The
worker creates separate base and head workspaces at those exact webhook SHAs, archives each into
owned snapshots, and derives changed ranges from the two trees. It does not rely on GitHub patch or
changed-files responses, which can be truncated for large PRs. Timeout, budget exhaustion, crash,
or incomplete analysis updates that same check to `neutral`; partial analysis is never a pass.

The queue and delivery cache are process-local, not durable. GitHub delivery redelivery plus the
check re-find lifecycle provide restart recovery. This runtime is intentionally single-tenant and
does not provide a durable external queue.

The worker disposes both source workspaces and both archive snapshots on every completion path.
Only introduced or worsened confirmed findings affect a failing conclusion; existing debt, resolved
findings, or unavailable attribution are reported without falsely pinning an unchanged source line.

## Required GitHub configuration

Grant exactly these App permissions:

- `metadata: read`
- `contents: read`
- `pull_requests: read`
- `checks: write`

Subscribe only to `pull_request`. Record the App ID, installation ID, private key, and webhook
secret outside the repository. Configure the webhook URL as `https://<public-host>/webhook`.

## Required environment

| Variable | Purpose |
|---|---|
| `AKER_BUILD_APP_ID` | Registered GitHub App ID |
| `AKER_BUILD_APP_PRIVATE_KEY` | PEM private key; process environment only |
| `AKER_BUILD_WEBHOOK_SECRET` | Webhook HMAC secret; process environment only |
| `AKER_BUILD_INSTALLATION_ID` | The one accepted installation ID |

Invalid or missing required values fail startup while naming only the variable. Never commit an
environment file or print these values in deployment logs.

## Bounded settings

All settings reject values outside their range instead of silently clamping them.

| Variable | Default | Valid range |
|---|---:|---:|
| `AKER_BUILD_BIND_HOST` | `127.0.0.1` | hostname/IP, explicit for non-loopback |
| `PORT` | `3000` | 1–65535 |
| `AKER_BUILD_MAX_BODY_BYTES` | 5 MiB | 64 KiB–10 MiB |
| `AKER_BUILD_WORKER_CONCURRENCY` | 2 | 1–16 |
| `AKER_BUILD_MAX_WAITING_JOBS` | 32 | 1–512 |
| `AKER_BUILD_CHECK_START_TIMEOUT_MS` | 5000 | 1000–8000 |
| `AKER_BUILD_JOB_TIMEOUT_MS` | 120000 | 10000–600000 |
| `AKER_BUILD_GIT_TIMEOUT_MS` | 60000 | 5000–300000 |
| `AKER_BUILD_SCAN_MAX_FILES` | 50000 | 100–250000 |
| `AKER_BUILD_SCAN_MAX_FILE_BYTES` | 2 MiB | 64 KiB–10 MiB |
| `AKER_BUILD_SCAN_MAX_TOTAL_BYTES` | 250 MiB | 1 MiB–2 GiB |
| `AKER_BUILD_STALE_WORKSPACE_AGE_MS` | 900000 | 60000–86400000 |
| `AKER_BUILD_DELIVERY_TTL_MS` | 900000 | 60000–86400000 |
| `AKER_BUILD_DELIVERY_CACHE_ENTRIES` | 4096 | 64–10000 |
| `AKER_BUILD_REQUEST_TIMEOUT_MS` | 10000 | 1000–30000 |
| `AKER_BUILD_HEADERS_TIMEOUT_MS` | 5000 | 1000–15000 |
| `AKER_BUILD_KEEP_ALIVE_TIMEOUT_MS` | 5000 | 1000–30000 |
| `AKER_BUILD_SOCKET_TIMEOUT_MS` | 15000 | 1000–60000 |
| `AKER_BUILD_TMP_ROOT` | OS temp + `aker-build-app` | absolute resolved runtime path |

The CLI scanner remains unbounded by default; the scan limits above apply to App child workers.

## Build and run

Build the two compiled entries:

```bash
pnpm --filter @aker-build/github-app-server build
node packages/github-app-server/dist/server.mjs
```

For a local container, supply the four required variables to Compose and keep the file containing
them outside version control:

```bash
docker compose --env-file /secure/path/aker-build.env -f deploy/github-app.compose.yml up --build -d
```

The image is pinned to Node 24 Alpine, runs as `node`, uses a dedicated temp volume, and supports a
read-only root filesystem. Compose drops Linux capabilities, enables `no-new-privileges`, and maps
the port only to host loopback. CI builds this image but never publishes it.

## TLS and network boundary

The source runtime binds to `127.0.0.1` by default. The container binds inside its namespace but is
published only at `127.0.0.1:3000`. Put a TLS-terminating reverse proxy on the same host and forward
only the webhook and operational routes that your monitoring requires. Do not expose the plain HTTP
listener directly to the internet. Preserve the GitHub webhook headers and raw request body.

## Probes and metrics

- `GET /healthz`: process liveness; returns `200` while the listener can answer.
- `GET /readyz`: admission readiness; returns `503` while capacity is full or shutdown has begun.
- `GET /metrics`: bounded JSON object containing fixed numeric fields only.
- `POST /webhook`: signed GitHub webhook intake.

The fixed metrics are `intake_total`, `accepted_total`, `duplicate_total`, `queue_rejected_total`,
`processing_total`, three outcome totals, `timeout_total`, `budget_exhaustion_total`,
`github_retry_total`, `workspace_cleanup_failure_total`, `queue_depth`, and `active_workers`.
Structured completion logs contain only the hashed delivery identifier, repository identity, PR
number, closed outcome, and duration. Raw bodies, command lines, source, secrets, and arbitrary
exceptions are excluded.

## Shutdown and recovery

Send `SIGTERM` or `SIGINT`. The service stops admission, waits up to the job deadline for the queue,
terminates remaining workers, removes its tracked workspaces, and closes the listener. On startup it
removes only old, validly marked Aker Build workspace wrappers under the configured temp root;
unmarked, symlinked, mismarked, or unrelated paths are ignored.

If a process dies before check completion, redeliver the GitHub webhook after the service is ready.
The lifecycle searches for the delivery-keyed check before creating one. Monitor neutral outcomes,
timeouts, retry growth, cleanup failures, queue rejection, and sustained readiness failures.

## Verification boundary

Local tests prove intake ordering, bounded execution, secret/workspace containment, retries,
shutdown, build contracts, and real local Git behavior. Before production sign-off, an operator must
still run the credentialed live-smoke checklist in
`specs/015-github-app-deployment/live-smoke-checklist.md`, confirm the public TLS proxy, and capture
the hosted CI/container-build evidence. Do not describe those items as verified until recorded.
