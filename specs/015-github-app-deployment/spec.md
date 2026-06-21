# Feature Specification: GitHub App Deployment Runtime

**Feature Branch**: `015-github-app-deployment`
**Created**: 2026-06-21
**Status**: Draft
**Input**: User description: "A deployment runtime for the report-only GitHub App built in 014. Provides a self-hostable single-tenant Node HTTP service that receives pull_request webhooks, verifies the HMAC signature, and dispatches to the existing handleEvent; a concrete octokit-backed ChecksClient; and a concrete Workspace (ephemeral checkout of the PR head, disposed after each event). Secrets (App private key, app id, installation auth, webhook secret) are read ONLY from the deployment environment and NEVER written to disk, logs, the Checks payload, error messages, or any artifact. Stays report-only (only writes checks.create/checks.update via the 014 safety allowlist), stateless, and stores no repository source. Degrades honestly: malformed/unsigned webhooks are rejected; an event it cannot fully review concludes neutral, never a false success. Does NOT change judgment logic, add P5 dashboard, or add P6 enforcing behavior."

## Clarifications

### Session 2026-06-21

- Q: How are GitHub credentials handled (the first feature touching live secrets — Principle VII)? → A: Credentials (App private key, app id, installation auth, webhook secret) are read ONLY from the deployment environment (environment variables or a secret manager) at runtime; they are NEVER written to disk, logs, the Checks payload, error messages, or any artifact. Secrets are used to authenticate, never surfaced.
- Q: What deployment runtime does v1 target? → A: A self-hostable, single-tenant, long-running Node HTTP service the org runs itself (matching 014's distribution model). Serverless and multi-host adapters are out of scope for this feature.
- Q: How does the service authenticate to the GitHub Checks API? → A: As the GitHub App installation. The service signs a short-lived app JWT with the env-supplied private key, exchanges it for a per-event installation access token scoped to the target repo, uses that token for the Checks write, and discards it after the event. Tokens and the private key are never persisted (FR-005/FR-006). This is the standard GitHub App auth flow; the token's natural short expiry bounds exposure.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The App actually runs against GitHub on a real PR (Priority: P1)

An operator deploys the service with the App's credentials supplied via environment/secret manager and points the GitHub App's webhook at it. When a pull request is opened on an installed repository, the service receives the webhook, verifies it, checks out the PR head, runs the existing review, and a TenantGuard check appears on the PR — the same verdict the 014 handler produces, now live.

**Why this priority**: This is the entire purpose of the feature — turning 014's fake-tested handler into something that runs against real GitHub. It is the smallest end-to-end slice that delivers value and is independently demonstrable. Without it, 014 is unreachable in production.

**Independent Test**: Send a signed `pull_request.opened` webhook (against a test repo/installation) to the running service and confirm a real Checks run appears on that PR at the head commit, with no other repository writes.

**Acceptance Scenarios**:

1. **Given** the service is running with valid credentials, **When** a signed `pull_request.opened` webhook arrives for an installed repo, **Then** the service verifies the signature, dispatches to `handleEvent`, and a Checks run is created on the PR head via the GitHub Checks API.
2. **Given** a PR whose head introduces a confirmed finding, **When** the service reviews it, **Then** the live check concludes `failure` with an annotation at the correct `file:line` — identical to the 014 handler's verdict for that diff.
3. **Given** any processed event, **When** the service finishes, **Then** the only GitHub write performed is `checks.create` or `checks.update` (no commit, push, merge, label, or other write).

---

### User Story 2 - Secrets never leak (Priority: P1)

The operator must be able to trust that the service, which holds the App's private key and webhook secret, never exposes them. Credentials come only from the environment; they never appear in logs, error output, the Checks payload, or any file the service writes.

**Why this priority**: This is the first TenantGuard feature handling live credentials, and Principle VII (No Secrets) is non-negotiable. A leaked App private key is a repository-takeover risk. Equal P1 with Story 1 — shipping the runtime without this guarantee would be unsafe.

**Independent Test**: Run the service through a full event with credentials set, capturing all logs, error output, written files, and the emitted Checks payload; assert none contains any credential value. Trigger error paths (bad signature, failed checkout, GitHub API error) and assert the same.

**Acceptance Scenarios**:

1. **Given** credentials supplied via environment, **When** the service processes any event (success or failure), **Then** no log line, error message, written file, or Checks payload contains the private key, webhook secret, or installation token.
2. **Given** a required credential is missing at startup, **When** the service starts, **Then** it fails fast with a message naming WHICH credential is absent — without printing any credential value.
3. **Given** any error during processing, **When** the service emits a diagnostic, **Then** the diagnostic is safe to log (no secret material).

---

### User Story 3 - Honest degradation under bad input and partial failure (Priority: P2)

The public webhook endpoint will receive malformed, unsigned, replayed, and unreviewable events. The service must reject what it cannot trust without processing, and for events it accepts but cannot fully review, conclude the check neutral — never a false success, never a crash that drops the event silently.

**Why this priority**: A public endpoint is exposed to bad input by definition; honest degradation is what keeps the report-only guarantee trustworthy (FR-011 from 014, now over a network boundary). Depends on Story 1 existing, hence P2.

**Independent Test**: Send (a) an unsigned request, (b) a wrong-signature request, (c) a non-`pull_request` event, (d) a valid event whose checkout/review fails; assert (a)–(c) are rejected/ignored without a check or processing, and (d) concludes a neutral check with an honest message.

**Acceptance Scenarios**:

1. **Given** a request with a missing or invalid signature, **When** it arrives, **Then** the service rejects it (4xx) without parsing the body further, dispatching, or creating a check.
2. **Given** a well-formed but non-reviewable event (e.g. a `pull_request` action outside the reviewable set, or a non-`pull_request` event), **When** it arrives, **Then** the service acknowledges it without creating a check (not an error).
3. **Given** a valid reviewable event whose checkout or review cannot complete, **When** processed, **Then** the check concludes `neutral` with an honest message and the ephemeral workspace is still disposed.

---

### Edge Cases

- **Missing credential at startup**: fail fast, name the missing variable, leak nothing.
- **GitHub Checks API rejects the write** (rate limit, transient error, missing permission): surface an honest, secret-free diagnostic; do not retry into a loop; the event may conclude without a posted check rather than crash the service.
- **Checkout fails or times out** (head ref gone, network, disk): conclude `neutral` (FR-011 semantics), dispose any partial workspace, never leave source on disk.
- **Duplicate/replayed delivery** for the same PR head: the idempotent update path (014 FR-012) ensures no duplicate check.
- **Concurrent events**: each event uses its own ephemeral workspace; one event's workspace must never be visible to another.
- **Oversized payload / slow body**: bounded handling so a single request cannot exhaust the service.
- **Workspace not disposed due to crash mid-event**: disposal must be guaranteed (finally-style), so no repository source accumulates across events.

## Requirements *(mandatory)*

> **Delivery scope note (2026-06-21):** This feature is delivered in two layers. The **runtime core** — webhook dispatch, signature/action gating, the sync-closure seam to `handleEvent`, secret-safe config, the Checks-client adapter shape, and the ephemeral-workspace logic — is built and tested (against ports/fakes + a recording git runner). The **live-GitHub edge** — a bound HTTP listener, a concrete octokit `GitHubApi`, a real `git` `GitRunner`, and the installation-token mint — is defined as injectable **ports** but the concrete adapters are **deferred** (they require adding an octokit/HTTP dependency, an explicit decision left to the owner). Until those adapters exist, the App does NOT yet run against live GitHub. FRs below are tagged **[core: built]** or **[edge: port defined, adapter deferred]** accordingly.

### Functional Requirements

- **FR-001** **[built]**: The service MUST define a single-delivery `dispatch` that verifies the HMAC signature over the raw body before any further processing (built), bound to an HTTP listener endpoint (`start`/`handleRequest`/`readBody` in `http-server.ts`) that reads the raw request bytes unchanged and enforces an oversize cap (413) before verification.
- **FR-002** **[built]**: On a verified, reviewable event, the service MUST dispatch to the existing 014 `handleEvent` with a concrete Checks client and workspace, producing and posting a Checks run for the PR head. The runtime MUST **scan the ephemeral checkout to produce its project-map BEFORE the gates run** (`prepareRepo` → `scanToFile` into an absolute out-dir inside the checkout, threaded into `reviewPr` as `opts.out`); without this the gates resolve `project-map.json` from cwd and every review degrades to neutral (the always-neutral defect, fixed + regression-tested via a real scan-over-a-real-checkout test).
- **FR-003** **[built]**: The service MUST define a `GitHubApi` port and a `ChecksClient` adapter over it whose only writes are `checks.create` / `checks.update`, routed through the 014 safety allowlist (built). The concrete octokit-backed `GitHubApi` (`makeGitHubApi` in `octokit-api.ts`) calls the real Checks API and reads changed files with full pagination (no page-1 truncation).
- **FR-004** **[built]**: The service MUST provide a workspace that checks out the PR head into a unique ephemeral directory and disposes of it (including self-cleanup of a partial dir on checkout failure) — built and tested against an injectable `GitRunner`. The concrete `GitRunner` (`makeNodeGit` in `node-git.ts`) shells to real `git` via `spawnSync`, tested against a real local repo.
- **FR-005**: The service MUST read all GitHub credentials (App private key, app id, installation authentication, webhook secret) ONLY from the deployment environment (environment variables or a secret manager) at runtime.
- **FR-006**: The service MUST NEVER write any credential value to disk, logs, the Checks payload, error messages, or any other artifact.
- **FR-007**: At startup, the service MUST validate that all required credentials are present and fail fast with a message naming any missing credential — without printing credential values.
- **FR-008**: The service MUST reject a request with a missing or invalid signature without parsing the body further, dispatching, or creating a check.
- **FR-009** **[built]**: The service MUST acknowledge a well-formed but non-reviewable event without creating a check (not treated as an error). This includes a signed but **structurally unparseable** body (GitHub's `ping`, a non-PR event, malformed JSON): `parseEvent` is guarded so these return **202**, never a 500 — a 5xx would make GitHub redeliver the same bad payload indefinitely.
- **FR-010** **[built]**: For a verified event the service cannot fully review (checkout failure, scan failure, a failed GitHub read, timeout), it MUST conclude the check `neutral` with an honest, **path-free/secret-free** message and MUST NOT report a false `success`. GitHub-read failures post a neutral check (not a 500); scan failures raise a fixed-message `PrepareRepoError` so no absolute checkout path reaches the public summary.
- **FR-011**: The service MUST be stateless: no database, nothing persisted across requests, and no repository source retained after an event (the workspace is ephemeral and disposed).
- **FR-012**: The service MUST remain report-only: beyond the Checks/annotations writes, it MUST perform no repository mutation and MUST execute no AI agent.
- **FR-013**: The service MUST NOT change any existing judgment logic — verdicts and findings come entirely from the existing review engine via `handleEvent`; this feature is transport/runtime only.
- **FR-014**: The service MUST handle concurrent events without cross-contamination — each event's ephemeral workspace MUST be isolated from every other event's.
- **FR-015** **[built]**: The service MUST authenticate to GitHub as the App installation by minting a per-event, short-lived installation access token, using it only for that event, and discarding it (never persisting the token or private key). The token is consumed via an injected `authToken()` port; the concrete JWT-sign + installation-token exchange is built (`makeAuthToken` in `auth.ts`, backed by `@octokit/auth-app`), and the REST client is installation-authenticated via the same `createAppAuth` strategy. Single-tenant: the sole installation id is read from `TENANTGUARD_INSTALLATION_ID` and captured at wiring time.

### Key Entities *(include if feature involves data)*

- **Service Configuration**: the runtime credential set (app id, private key, installation auth, webhook secret) sourced from the environment. Never persisted, never logged.
- **Inbound Delivery**: a received webhook request — raw body + signature header. Transient; verified before use; discarded after dispatch.
- **Checks Client**: the concrete GitHub-backed implementation of the 014 `ChecksClient` interface (create/update/find). Its only operations are Checks writes.
- **Ephemeral Workspace**: a per-event working directory holding the checked-out PR head, created on checkout and removed on dispose. Holds repository source only transiently.

## Success Criteria *(mandatory)*

### Measurable Outcomes

> **Verification scope:** SC-001/SC-002 describe live end-to-end operation. The edge adapters (HTTP listener, octokit `GitHubApi`, real `git`, installation-token mint) are now **built and wired end-to-end** — the full path from raw webhook bytes → signature verify → `handleEvent` → Checks payload is exercised by automated tests, the HTTP entrypoint and oversize guard are unit-tested, the `GitRunner` is tested against a real local git repo, and secret-safety is asserted across success + checkout-failure + bad-signature paths with sentinel credentials. **What automated tests do NOT cover:** a real network round-trip against api.github.com — i.e. that a registered App's credentials actually mint a token, that octokit's real Checks API accepts the payload, and that `git fetch` against a private repo with the minted token succeeds. Those require a registered GitHub App + installation and are provable only by a **live integration / manual smoke test**, not by the green unit suite. The green suite proves the runtime is correctly *assembled and secret-safe*; it does not by itself prove "it runs live."

- **SC-001**: An operator can deploy the service with credentials in the environment and, on a real opened PR, see a TenantGuard check appear with no per-PR manual steps.
- **SC-002**: For a PR with a known confirmed finding, the live check concludes `failure` with an annotation at the correct file and line in 100% of acceptance runs, matching the 014 handler verdict for the same diff.
- **SC-003**: Across all acceptance runs (success and every error path), zero credential values appear in any log, error message, written file, or Checks payload.
- **SC-004**: Across all acceptance runs, the only repository writes performed are Checks create/update — zero commits, branches, labels, merges, or code changes.
- **SC-005**: Across all acceptance runs, zero bytes of repository source remain on disk after an event completes (workspace always disposed).
- **SC-006**: Unsigned and wrong-signature requests are rejected without a check in 100% of cases; non-reviewable events produce no check and no error.
- **SC-007**: Every event that cannot be fully reviewed concludes `neutral`, never `success`, in 100% of failure-mode acceptance cases.

## Assumptions

- This feature consumes 014's `handleEvent`, `ChecksClient`, and `Workspace` interfaces unchanged; it supplies concrete implementations and the host. No 014 judgment behavior is altered.
- "Self-hostable, single-tenant" matches 014's distribution clarification: one org runs one service instance for its own installation. Public multi-tenant hosting is out of scope.
- The service authenticates to GitHub as the App installation using the environment-supplied credentials; the specific GitHub auth mechanism (e.g. installation tokens) is an implementation detail for the plan, constrained only by FR-005/FR-006.
- The ephemeral checkout uses the host's git access at the PR head ref; no persistent clone or mirror is kept (FR-011).
- Observability (request logging, metrics) is permitted but MUST be secret-free (FR-006); detailed logging/metrics design is deferred to the plan.
- This feature is roadmap P4 (runtime completion). It does NOT include P5 (org view / dashboard) or P6 (enforcing / blocking-merge). Setting a check conclusion is reporting, not enforcement.
