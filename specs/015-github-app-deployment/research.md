# Phase 0 Research: 015 GitHub App Deployment Runtime

Decision / Rationale / Alternatives for each resolved unknown.

## R1 — GitHub authentication & token lifecycle (Principle VII surface)

**Decision**: Standard GitHub App installation auth. At event time: sign a short-lived app JWT with the env-supplied private key → exchange for an installation access token scoped to the target repo → use it for that event's Checks write(s) → discard. Never persist the private key or token; never log either (FR-005/FR-006/FR-015).

**Rationale**: This is GitHub's prescribed App flow; installation tokens expire quickly, bounding exposure even in memory. Per-event minting keeps the service stateless (no token cache to persist or leak).

**Alternatives considered**:
- *Long-lived PAT* — rejected: not an App credential, broader scope, longer-lived secret to guard.
- *Cache installation tokens across events* — rejected: introduces stored credential state (Principle VII tension) for negligible gain at single-tenant scale.

## R2 — HTTP server choice

**Decision**: A minimal Node HTTP endpoint (built-in `http` or a thin framework) exposing one POST route for webhooks. Read the raw body (needed for HMAC), verify signature (reuse 014 `verifySignature`), then `parseEvent`, then dispatch. Bounded body size; reject oversized.

**Rationale**: One route, no sessions, no static assets — a heavy framework adds dependency surface for nothing. Raw-body access is mandatory for signature verification, so body parsing must not consume it first.

**Alternatives considered**:
- *Full web framework* — rejected: unneeded surface for a single webhook route.
- *Serverless function* — deferred (out of spec scope): ephemeral git checkout under FaaS filesystem/timeout limits is more constrained; the host-agnostic core leaves this open for later.

## R3 — Ephemeral git checkout mechanism

**Decision**: Per event, create a fresh temp directory, fetch/checkout the PR **head** SHA (shallow where possible), return its path as the `Workspace.checkout` result; `dispose` removes the directory. Disposal is guaranteed via finally-style handling in 014's runner (`run` already wraps `reviewPr` in try/finally calling `dispose`).

**Rationale**: Gates read the filesystem (014/`reviewPr` contract), so a real checkout is required. Shallow + temp + always-dispose keeps it stateless and leaves zero source on disk (SC-005). Head SHA matches what the reviewer sees (consistent with 014 R5).

**Alternatives considered**:
- *Persistent local mirror for speed* — rejected: stored source violates FR-011/SC-005.
- *GitHub tarball download instead of git* — viable, but git checkout reuses the repo's existing assumptions and keeps diff/attribution semantics identical; chosen for fidelity.

## R4 — Concrete ChecksClient over the GitHub API

**Decision**: Implement 014's `ChecksClient` (create/update/find) using the installation-token'd REST client. `findCheck` locates an existing Aker Build check-run for the head (idempotency, 014 FR-012). Every method maps to a Checks API call and nothing else; the 014 `assertAllowedWrite` gate still wraps writes in `postCheck`.

**Rationale**: Satisfies the existing interface exactly, so `handleEvent` is unchanged. The allowlist gate remains the single mutation chokepoint even with a live client behind it.

**Alternatives considered**:
- *Add convenience writes (labels, comments)* — rejected: forbidden by scope and the allowlist; would breach report-only.

## R5 — Secret-leak prevention (how it's proven, not just claimed)

**Decision**: (a) A `config.ts` that reads creds from env and validates presence, failing fast with the variable NAME only (never the value). (b) A logging convention: structured, allowlisted fields only — credentials are never passed to the logger. (c) A dedicated `secret-safety.test.ts` that runs success and every error path with sentinel credential values set, capturing all log output, thrown error messages, the emitted Checks payload, and any written file, and asserting none contains a sentinel.

**Rationale**: Principle VII is non-negotiable, so the spec demands it be *tested*, not asserted. Sentinel-based capture across all paths is how SC-003 becomes verifiable.

**Alternatives considered**:
- *Trust code review alone* — rejected: a regression could reintroduce a leak silently; the test is the guard.
