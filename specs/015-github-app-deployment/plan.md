# Implementation Plan: 015 GitHub App Deployment Runtime

Status: Planned (docs-only; implementation follows on this branch)
Feature: `015-github-app-deployment`
Date: 2026-06-21
Spec: `specs/015-github-app-deployment/spec.md`

## Summary

Provide the live host and concrete implementations that make the 014 report-only GitHub App run against real GitHub. 014 shipped a pure `handleEvent` plus injectable `ChecksClient` and `Workspace` interfaces (fake-tested only). This feature adds: a self-hostable single-tenant Node HTTP service that verifies webhook signatures and dispatches to `handleEvent`; a concrete octokit-backed `ChecksClient`; and a concrete git-backed `Workspace` (ephemeral checkout of the PR head, disposed per event). Credentials come only from the environment and never leak. No judgment logic changes.

## Technical Context

**Language/Version**: TypeScript on Node.js LTS (`engines.node >=22.13`).
**Primary Dependencies**: `@tenantguard/github-app` (014 — `handleEvent`, `ChecksClient`, `Workspace`, `RunnerDeps`); an Octokit-style GitHub REST client; Node's built-in `http` (or a minimal server) for the webhook endpoint; `node:child_process`/git for checkout; `node:crypto` (already used by 014's `verifySignature`).
**Storage**: None (stateless; ephemeral per-event workspace; no DB). Credentials live only in the process environment.
**Testing**: Vitest. GitHub REST and git are faked at the boundary (no live network/git in unit tests); secret-leak assertions capture logs/errors/payloads/written files.
**Target Platform**: A self-hostable long-running Node service an org runs itself (spec Clarifications). Serverless/multi-host adapters out of scope.
**Project Type**: New workspace package `packages/github-app-server` — the deployment/runtime layer over 014. 014 stays the pure logic package; this is its host.
**Performance Goals**: Event-driven, single-tenant; one review per PR head; no throughput target. Bounded request handling so one delivery can't exhaust the service.
**Constraints**: Secrets env-only, never persisted/logged/surfaced (FR-005–FR-007); report-only (only `checks.create`/`checks.update` via 014's allowlist); stateless; honest neutral on incomplete review; per-event workspace isolation + guaranteed disposal.
**Scale/Scope**: One org / one installation per instance.

## Constitution Check

*GATE: evaluated against `.specify/memory/constitution.md` (v1.1.0).*

| Principle | Verdict | Justification |
|---|---|---|
| I. Source Truth First | PASS | Reviews source at the checked-out PR head ref; no assertion from memory. |
| II. CLI First | PASS | The CLI remains the canonical local interface; this is the App's host, not a prerequisite for core value. Logic stays in 014/`review`. |
| III. Evidence-Based Findings | PASS | Findings/annotations are produced by the existing engine via `handleEvent`; this layer adds none. |
| IV. Spec-Compatible | PASS | Works on any installed repo; no Spec Kit requirement imposed on reviewed repos. |
| V. Agent Safety by Default | N/A | No AI-agent prompts; no agent execution. |
| VI. No Hidden Mutation | PASS | Only writes a Checks run + annotations (014 allowlist). No commit/push/merge/auto-fix/agent-exec. Within the v1.1.0 report-only App approval. |
| VII. No Secrets | PASS (the critical surface) | First feature handling live credentials. Secrets read ONLY from the environment (FR-005), NEVER written to disk/logs/payload/errors/artifacts (FR-006), fail-fast-without-leak on missing (FR-007). Per-event installation token is short-lived and discarded (FR-015). This is the constitution's exact discipline — secrets used to authenticate, never surfaced — verified by a dedicated secret-leak test (US2/SC-003). |
| VIII. General SaaS Kernel | PASS | Pure GitHub-integration runtime; no Retail Tower / ERPNext logic. |

**Gate result: PASS.** No new governance gate (015 is runtime completion of the already-approved P4 App). Principle VII is the surface that must be proven, not waived — handled by FR-005–FR-007 + secret-leak tests.

## Package boundary

```text
packages/github-app-server   (new)
  http: webhook endpoint; verify signature (reuse 014 verifySignature); parse (reuse 014 parseEvent)
  auth: mint short-lived installation token from env app creds; discard per event (FR-015)
  octokit-checks-client: concrete ChecksClient (create/update/find) over the Checks API
  git-workspace: concrete Workspace (checkout head ref -> ephemeral dir; dispose always)
  gh-sources: octokit-backed prChangedFiles / prMetadata for RunnerDeps
  config: read + validate env credentials; fail-fast, never print values (FR-005/FR-007)
  dispatch: verified+reviewable event -> 014 handleEvent with the concrete deps

packages/github-app          (reuse — handleEvent, ChecksClient/Workspace ifaces, safety allowlist)
```

## Project Structure

```text
packages/github-app-server/
├── src/
│   ├── config.ts        # env credential load + fail-fast validation (no value printing)
│   ├── auth.ts          # app JWT -> per-event installation token; discard after use
│   ├── checks-client.ts # concrete ChecksClient over octokit (writes only checks.create/update)
│   ├── git-workspace.ts # concrete Workspace: ephemeral checkout + guaranteed dispose
│   ├── gh-sources.ts     # octokit-backed prChangedFiles / prMetadata
│   ├── server.ts         # http endpoint: verify -> parse -> dispatch; honest 4xx/2xx
│   └── index.ts          # compose + start
└── tests/
    ├── config.test.ts        # missing creds fail fast; no value leaks
    ├── auth.test.ts          # token minted + not persisted/logged
    ├── checks-client.test.ts # maps ChecksClient calls to API; only checks writes
    ├── git-workspace.test.ts # checkout returns path; dispose always runs
    ├── server.test.ts        # unsigned/wrong-sig rejected; non-reviewable ignored; valid dispatched
    └── secret-safety.test.ts # NO credential value in logs/errors/payload/files on any path (US2/SC-003)
```

**Structure Decision**: A new `packages/github-app-server` package, keeping 014 (`packages/github-app`) as the pure, fake-testable logic layer and this as its runtime host. Matches the one-package-per-feature monorepo pattern; the server depends on 014's public exports only.

## Scope

Allowed files:

```text
packages/github-app-server/**
specs/015-github-app-deployment/**
packages/github-app/** — read-only exports AND the additive runner changes the live edge required (see note)
CLAUDE.md active feature pointer only
pnpm-lock.yaml only for the new workspace package manifest + any added GitHub/HTTP dep
README.md / packages/cli/README.md only to document running the service
```

> **Scope deviation (live-edge implementation, surfaced not silent):** the original plan allowed `packages/github-app/**` only for read-only exports with *no behavior change*. Building the live edge required **additive behavior changes** to 014, because the always-neutral defect lives in 014's `run()`:
> - `RunnerDeps.prepareRepo?` + threading the produced project-map out-dir into `reviewPr` (so the gates read the checkout, not cwd — this was the always-neutral bug).
> - `PrepareRepoError` + `incompletePayload` export (honest neutral + path-free reason on scan failure).
> - Tightened `webhookEventSchema` `head.sha` to a hex-only regex (boundary hardening / argv-injection defense).
>
> **These are additive runtime/validation changes; NONE change gate/scanner/review JUDGMENT** — verdicts and findings still come entirely from the unchanged engine (Principle VI / FR-013 intact). The constitution's harder rule ("no changes to gate/scanner/review judgment behavior") is upheld.

Forbidden files:

```text
Any code that commits, pushes, merges, labels, or modifies repo contents
Auto-fix / auto-merge / agent execution
Persisting credentials, tokens, or repository source
Logging / printing any secret value
Hosted multi-tenant dashboard (P5) or enforcing/blocking-merge logic (P6)
Changes to existing gate/scanner/review JUDGMENT behavior
Broad rewrites unrelated to the runtime layer
```

## Validation

Required:

```bash
pnpm --filter @tenantguard/github-app-server test
pnpm test
pnpm typecheck
```

Focused scenarios (mirror spec acceptance):

```text
signed opened webhook -> dispatched to handleEvent -> Checks run created (US1/SC-001)
confirmed finding -> live check failure + annotation at file:line, matches 014 verdict (US1/SC-002)
unsigned / wrong-signature -> rejected, no check, no dispatch (US3/SC-006/FR-008)
non-reviewable event -> acknowledged, no check, no error (US3/FR-009)
checkout/review failure -> neutral conclusion, workspace disposed (US3/FR-010/SC-007)
missing credential at startup -> fail fast naming the var, no value printed (US2/FR-007)
NO secret value in any log/error/payload/written file on any path (US2/SC-003)
only checks.create/update writes performed (FR-012/SC-004)
zero repo source on disk after event (FR-011/SC-005)
```

## Stop conditions

Stop and report if:

- Any path would require persisting/logging a credential value (Principle VII breach).
- The runtime would require a repository write beyond the Checks API.
- Implementation would need to change 014's interfaces or any judgment behavior.
- Work drifts toward P5 (dashboard) or P6 (enforcing check).
- A new ADR is needed (e.g. the GitHub auth/token model) and is not yet approved.

## Complexity Tracking

| Item | Why needed | Why the constitution still holds |
|---|---|---|
| New `packages/github-app-server` + a GitHub REST/HTTP dependency | A live host needs an HTTP endpoint and real GitHub I/O | First runtime with network/secret I/O; Principle VII upheld by env-only + never-persist + secret-leak tests. Report-only via 014's allowlist — mutation wall intact. New dep is the GitHub client, declared in the new manifest only (lockfile change allowed by scope). |
| Live git checkout per event | Gates read the filesystem (014/`reviewPr` contract) | Ephemeral + disposed-always (FR-004/FR-011); no source persisted (SC-005). |
