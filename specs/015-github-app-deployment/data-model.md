# Phase 1 Data Model: 015 GitHub App Deployment Runtime

All entities transient/in-memory. **Nothing persisted** — no datastore, no stored source, no stored credentials (FR-005/FR-006/FR-011). The runtime supplies concrete forms of 014's interfaces; it does not redefine 014's data shapes.

## Entity: AppCredentials (config, in-memory only)

Loaded from the environment at startup; validated; never written anywhere.

| Field | Source | Notes |
|---|---|---|
| appId | env | GitHub App id |
| privateKey | env / secret manager | used to sign the app JWT; never logged/persisted |
| webhookSecret | env / secret manager | HMAC key for signature verification |

Validation: all required fields present at startup or **fail fast** naming the missing variable, value never printed (FR-007). Held only in process memory.

## Entity: InstallationToken (transient, per-event)

| Field | Notes |
|---|---|
| token | minted from app JWT for the target installation/repo; short-lived |
| (lifetime) | used for this event's Checks write only, then discarded — never persisted or logged (FR-015) |

## Entity: InboundDelivery (transient)

The received webhook request, before trust is established.

| Field | Notes |
|---|---|
| rawBody | exact bytes — required for HMAC verification before parsing |
| signatureHeader | `X-Hub-Signature-256`; verified via 014 `verifySignature` |

Lifecycle: verify → `parseEvent` (014) → dispatch → discard. A failed signature stops the lifecycle immediately (FR-008).

## Entity: EphemeralWorkspace (transient, per-event)

Concrete form of 014's `Workspace`.

| Operation | Behavior |
|---|---|
| checkout({owner,repo,headSha}) | create temp dir, checkout the head SHA, return absolute path |
| dispose(repoRoot) | remove the temp dir; called ALWAYS (even on failure) |

Invariant: no two concurrent events share a workspace (FR-014); zero source remains after `dispose` (SC-005).

## Entity: ChecksClientImpl (concrete 014 ChecksClient)

| Method | Maps to | Constraint |
|---|---|---|
| createCheck | Checks API create | routed through 014 `assertAllowedWrite("checks.create")` |
| updateCheck | Checks API update | routed through 014 `assertAllowedWrite("checks.update")` |
| findCheck | Checks API list/lookup for head | enables idempotent update (014 FR-012) |

Constraint: these three are the ONLY GitHub writes the runtime performs (FR-012/SC-004).

## Reused 014 shapes (NOT redefined)

- `PullRequestEvent`, `ChecksPayload`, `HandlerDeps`/`RunnerDeps` — consumed verbatim from `@aker-build/github-app`.
- The verdict/findings/annotations come from the existing engine via `handleEvent`; this layer supplies transport only (FR-013).

## Secret-handling invariant (cross-cutting, Principle VII / FR-006)

No credential value (`privateKey`, `webhookSecret`, `token`) may appear in: any log line, any thrown/serialized error message, the emitted `ChecksPayload`, or any file written by the service. Enforced by a no-secret logging convention and proven by `secret-safety.test.ts` (sentinel scan across all paths, SC-003).
