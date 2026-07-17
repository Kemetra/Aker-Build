# Feature Specification: GitHub App Runtime Fortification

**Feature**: `017-github-app-runtime-fortification`
**Created**: 2026-07-17
**Status**: Locally implemented and externally reviewed; hosted/live/container execution pending (2026-07-17)
**Program**: `docs/superpowers/specs/2026-07-17-production-trust-and-expansion-program-design.md`

## Purpose

Move the self-hosted, single-tenant GitHub App from synchronous webhook execution to a bounded,
observable, recoverable runtime without weakening its report-only, stateless, and secret-safe
contract. The HTTP process must acknowledge only after an operator-visible in-progress check exists,
then run repository work outside the intake event loop.

017 does not change finding judgment, PR comparison semantics, detector coverage, merge enforcement,
or the GitHub write allowlist. It may write only Checks create/update calls.

## User scenarios

### US1 - Fast, durable-visible intake (P1)

A valid signed `pull_request` delivery is validated, matched to the configured installation,
deduplicated, admitted to a bounded queue, and given an `in_progress` Aker Build check before the
server returns `202`. Checkout and scanning begin only after the response is ended.

**Independent test**: hold a worker behind a barrier and prove the HTTP response completes first,
the check already exists, health remains responsive, and one delivery enqueues once.

### US2 - Bounded, honest execution (P1)

Repository work runs in a child process with fixed time, Git, file-count, per-file, and aggregate-read
budgets. Overflow returns `503`; timeouts and budget exhaustion update the existing check to neutral
with a closed reason code and never produce success from partial analysis.

**Independent test**: exceed each queue/scan/deadline boundary and assert the fixed outcome, one
check identity, no source residue, and no leaked exception text.

### US3 - Workspace and credential containment (P1)

Every checkout is tracked beneath one configured temp root and carries a validated ownership marker.
Git authentication is passed through a child-only environment, never argv or `.git/config`.
Cleanup can remove only tracked/marked, contained workspaces; stale cleanup ignores symlinks,
unmarked directories, invalid markers, and out-of-root paths.

**Independent test**: use sentinel credentials and adversarial cleanup paths; assert no sentinel in
argv, output, errors, logs, marker, Git config, or metrics, and assert unrelated paths survive.

### US4 - Operable self-hosted service (P2)

Operators receive liveness, readiness, allowlisted structured logs, bounded metrics, explicit socket
timeouts, graceful shutdown/drain behavior, and a compiled non-root container with a dedicated temp
volume and health check.

**Independent test**: exercise health/readiness under load, retries, shutdown, and cleanup; build and
smoke the container locally without publishing it.

## Functional requirements

- **FR-001**: Verify HMAC before parsing or trusting any payload field.
- **FR-002**: Require `X-GitHub-Event: pull_request`; acknowledge other event types with no checkout or
  check. Require a syntactically valid UUID `X-GitHub-Delivery` for reviewable events.
- **FR-003**: Validate action/schema, owner, repo, SHA, and configured installation equality before
  queue admission or checkout.
- **FR-004**: Deduplicate delivery IDs in a bounded TTL cache. A duplicate creates no second job.
- **FR-005**: Bound active workers (default 2) and waiting jobs (default 32). Overflow returns `503`
  without accepting the delivery.
- **FR-006**: Before `202`, create or update one Aker Build check for the head to `in_progress` within
  a five-second deadline. Failure to establish visibility must not acknowledge acceptance.
- **FR-007**: Begin checkout/scan only through an explicit post-response activation.
- **FR-008**: Execute each accepted job in a child process. IPC may carry only validated owner, repo,
  PR number, SHA, draft flag, installation ID, delivery hash, and closed outcome codes.
- **FR-009**: Default whole-job deadline is 120 seconds; Git subprocess deadline is 60 seconds.
- **FR-010**: Introduce reusable `ScanBudget`, `ScanUsage`, and `ScanBudgetExceededError` contracts.
  App defaults are 50,000 files, 2 MiB per readable file, and 250 MiB aggregate bytes read. CLI scans
  remain explicitly unbounded in 017.
- **FR-011**: Timeout, budget exhaustion, worker crash, or incomplete work must update the existing
  check to neutral with a closed `IncompleteReason`; arbitrary error text is never public.
- **FR-012**: Retry transient GitHub reads and idempotent writes at most three attempts with bounded
  exponential backoff and jitter. Never retry signature, schema, authentication, authorization, or
  unsafe create operations without a re-find idempotency step.
- **FR-013**: Pass Git credentials only through a child-process environment. No credential may appear
  in argv, remote URLs, Git config, logs, errors, payloads, marker files, or metrics.
- **FR-014**: Validate owner/repo before remote construction and use option separators for untrusted
  positional values.
- **FR-015**: Track every created workspace as a marked wrapper containing a separate `repo/`
  checkout, keyed by resolved path and random nonce beneath the configured temp root. Keeping the
  marker outside `repo/` prevents collision with repository content. `dispose` refuses untracked,
  mismarked, symlinked, or out-of-root targets.
- **FR-016**: Startup and graceful shutdown remove only stale, prefix-matching, validly marked,
  contained workspaces older than 15 minutes.
- **FR-017**: Provide `/healthz` liveness and `/readyz` readiness. Provide a bounded JSON `/metrics`
  snapshot containing only fixed metric names and numeric values.
- **FR-018**: Logs use an allowlist: hashed delivery ID, owner/repo identity, PR number, outcome code,
  duration, and counts. No raw bodies, source, command lines, secrets, or raw exceptions.
- **FR-019**: Configure request, headers, keep-alive, idle socket, body, and check-start deadlines.
  Default bind is loopback; non-loopback binding requires an explicit environment value and the guide
  requires TLS termination upstream.
- **FR-020**: Graceful shutdown stops intake, drains active work up to the job deadline, terminates
  remaining workers, disposes tracked workspaces, and closes the listener.
- **FR-021**: Produce a compiled container build that runs non-root, declares its temp volume and
  health check, and is compatible with a read-only root filesystem. CI builds but never publishes it.
- **FR-022**: Preserve report-only behavior and the Checks-only write allowlist.

## Fixed defaults and safe ranges

| Setting | Default | Valid range |
|---|---:|---:|
| body bytes | 5 MiB | 64 KiB–10 MiB |
| worker concurrency | 2 | 1–16 |
| waiting jobs | 32 | 1–512 |
| check-start deadline | 5 s | 1–8 s |
| whole job | 120 s | 10–600 s |
| Git subprocess | 60 s | 5–300 s |
| file count | 50,000 | 100–250,000 |
| readable file | 2 MiB | 64 KiB–10 MiB |
| aggregate reads | 250 MiB | 1 MiB–2 GiB |
| stale workspace age | 15 min | 1–1440 min |
| delivery TTL | 15 min | 1–1440 min |

## Success criteria

- **SC-001**: Valid intake returns `202` after the in-progress check and before worker activation.
- **SC-002**: Duplicate delivery IDs produce at most one job per process lifetime/TTL window.
- **SC-003**: Queue overflow, deadline, budget exhaustion, or worker failure never reports success.
- **SC-004**: Active jobs never exceed configured concurrency and use distinct workspaces.
- **SC-005**: No adversarial cleanup input removes an unowned or out-of-root path.
- **SC-006**: Sentinel credentials are absent from argv, files, logs, errors, payloads, and metrics.
- **SC-007**: Health/readiness/retry/shutdown/stale-cleanup paths have automated coverage.
- **SC-008**: Full tests, typecheck, first-run smoke, production audit, build, and local container smoke
  pass. Credential-gated live full-host smoke remains separately classified until actually run.

## Explicit non-goals

- Durable external queues/databases, multi-tenant routing, dashboard/org aggregation, enforcement,
  auto-fix/commit/merge, agent execution, diff-aware review, and detector expansion.
- Publishing an image, changing repository settings, or claiming live GitHub verification without
  credentials and hosted evidence.

## Evidence boundary

Official GitHub documentation requires prompt 2xx webhook responses, identifies delivery GUIDs for
deduplication/redelivery, and supports `in_progress` Checks runs that are completed later. Local tests
can prove composition and safety; only an operator-owned registered App can prove the full public
webhook-to-GitHub path.
