# 017 GitHub App Runtime Fortification Implementation Plan

> Test-first execution only. Do not commit, push, publish an image, mutate repository settings, or
> run a credentialed live test without a separate owner request.

**Status**: Locally implemented and verified after owner-delegated external review (2026-07-17)
**Goal**: Convert the App host into a bounded intake/worker runtime with safe workspaces and a compiled
container while preserving Checks-only behavior.
**Dependencies**: 016 local baseline is complete. 018+ behavior is forbidden.
**Tech**: TypeScript, Node child processes/HTTP, Vitest, esbuild, Docker, existing Octokit adapters.

## Source evidence

- `http-server.ts` currently awaits `dispatch`, so metadata, checkout, scan, review, and check posting
  occur before the response.
- `git-workspace.ts` currently puts the encoded installation token in Git `-c` argv and permits
  disposal of any caller-supplied existing path.
- `node-git.ts` has no subprocess deadline.
- `scanner/io.ts` has no file-count, file-size, or aggregate-read budget.
- The current runtime has no delivery identity, installation equality check, queue, readiness,
  metrics, retry policy, managed stale cleanup, or compiled artifact.

## Architecture and ordering

```text
socket -> bounded raw body -> intake validation -> queue reservation
       -> ensure in-progress check -> 202/end -> activate reserved job
       -> child worker -> bounded scan/review -> complete same check -> cleanup
```

Extract `processVerifiedEvent(event, deps)` from the current `dispatch` implementation. The legacy
`dispatch(rawBody, signature, deps)` remains a compatibility/test wrapper that verifies and parses,
then delegates. The child calls only `processVerifiedEvent` with validated metadata, so raw bodies and
signatures never enter IPC. New intake code owns headers, installation match, delivery cache, capacity
reservation, initial check lifecycle, and activation. Production queue execution uses `fork`; tests
inject an in-process fixed-result worker seam.

The parent never sends credentials or source over IPC. The child inherits the process environment,
constructs its own authenticated dependencies, and receives only validated job metadata. Parent-side
timeout/crash handling completes the known check with a fixed neutral payload.

## File scope

### Allowed

- `packages/github-app/src/types.ts`, `packages/github-app/tests/webhook.test.ts`
- `packages/scanner/src/{budget,io,scan,types,index}.ts`, scanner tests
- `packages/github-app-server/src/**`, `packages/github-app-server/tests/**`, package README,
  `package.json`, `tsconfig.json`, build script, Dockerfile
- `pnpm-lock.yaml` only for the reviewed direct build dependency
- `.dockerignore`, `deploy/github-app.compose.yml`
- `.github/workflows/aker-build.yml` only for local artifact/container build verification
- root README/CLAUDE and `docs/operations/github-app-runtime.md`
- `specs/017-github-app-runtime-fortification/**` and program status

### Forbidden

- Review verdict/schema/fingerprint behavior, gate/detector logic, Project Map schema, P5/P6,
  mutation/merge/agent code, secrets, external queue/database, image publication, and settings changes.

## Implementation phases

### 1. RED contracts

Add failing tests for: scan budgets; owner/repo validation; event/delivery/installation boundaries;
in-progress-before-202 and post-response activation; dedupe/capacity/concurrency; worker timeout/crash;
environment-only Git auth and timeout; tracked/marked containment and stale cleanup; retry
classification; health/readiness/metrics/socket settings/shutdown; build/container policy.

### 2. Scanner budget primitive

Implement an `AsyncLocalStorage`-backed explicit budget context so every scanner/gates filesystem
primitive shares one tracker during an App job without plumbing a new parameter through every
detector. `readFileSafe` must rethrow `ScanBudgetExceededError`, never convert it to unreadable. The
default outside a context is unbounded, preserving CLI behavior.

### 3. Workspace and Git containment

Change `GitRunner` to accept an allowlisted child environment and timeout. Supply the auth header via
`GIT_CONFIG_COUNT/KEY_0/VALUE_0`, not argv. Validate owner/repo. Create a marked wrapper beneath the
temp root and check source out into its separate `repo/` child so repository content cannot collide
with the ownership marker. Track both resolved paths, make disposal nonce-checked and contained, and
implement conservative stale cleanup.

### 4. Intake and queue

Add validated runtime config, delivery TTL cache, reservable bounded queue, lifecycle Checks methods,
fixed incomplete reasons, metrics/logging primitives, and intake controller. Capacity is reserved
before the initial network call; failed visibility releases both reservation and delivery ID.
Activation occurs only after `res.end`.

### 5. Child worker and reliability

Add a fork-based worker executor and worker entry. Build source and compiled worker entry points; the
parent resolves the matching `.ts`/`.mjs` sibling without putting job metadata in argv. The child
composes its own dependencies, wraps the whole review in the shared scan budget, and sends a fixed
outcome. Add idempotency-aware transient GitHub retry and parent neutral completion by known check ID
for timeout/crash.

### 6. HTTP operation and shutdown

Route `/webhook`, `/healthz`, `/readyz`, and `/metrics`; reject unknown routes/methods. Configure Node
timeouts and loopback default. Shutdown stops admissions, drains/terminates workers, runs managed
cleanup, and closes the server. Logs/metrics are allowlisted data only.

### 7. Compiled container

Bundle server and worker entries with a reviewed direct esbuild dev dependency. Build a Node 24
multi-stage image with Git, non-root user, health check, declared temp volume, no embedded secrets,
and a compose example with read-only rootfs/tmp volume. CI builds but does not push.

### 8. Verification and external review

Run focused scanner/App/server tests, full tests/typecheck, package build, first-run smoke, production
audit, Docker build/smoke when Docker is available, `git diff --check`, secret scan, and external diff
review. Record Docker/live/hosted unavailability as a gap, never a pass.

## External-review rejection checklist

Reject if any condition holds:

- `202` can occur without an in-progress check or a worker can start before response completion.
- A duplicate/overflow race can enqueue twice or exceed concurrency/capacity.
- Credentials enter argv, IPC, URLs, config, marker, logs, metrics, payloads, or errors.
- Cleanup accepts caller paths without tracked nonce + resolved containment.
- Partial/timeout/budget work can conclude success or expose raw exception text.
- Retry can duplicate a check create or retries auth/authorization/schema/signature failures.
- CLI receives bounded behavior by accident or scanner budget errors are swallowed.
- Container runs root, embeds credentials/source, lacks health/temp ownership, or CI publishes it.
- Any 018+ judgment, mutation, P5/P6, lockfile-unrelated, or broad refactor drift appears.

## Verification commands

```powershell
pnpm --filter @aker-build/scanner test
pnpm --filter @aker-build/github-app test
pnpm --filter @aker-build/github-app-server test
pnpm --filter @aker-build/github-app-server build
pnpm test
pnpm typecheck
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
pnpm audit --prod
docker build -f packages/github-app-server/Dockerfile -t aker-build-app:local .
git diff --check
git status --short
```

## Hosted/manual handoff

- First hosted matrix/container job.
- Registered-App signed full-host smoke and redelivery.
- TLS/reverse-proxy deployment, read-only filesystem, temp-volume, shutdown, and operational alert
  confirmation.
