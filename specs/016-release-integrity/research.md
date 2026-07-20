# Research: Release Integrity

**Date**: 2026-07-20
**Spec**: [spec.md](./spec.md)

## Evidence Snapshot

### Repository verification

- Branch: `main`.
- Initial worktree state: clean before creating `specs/016-release-integrity/`.
- Documented first-run smoke: passed end to end (`scan → gates → queue → route → prompt → review-pr → report`).
- Workspace tests: fail in `@aker-build/eval` because `packages/eval/src/run-case.ts` still imports `@tenantguard/scanner` and `@tenantguard/gates`.
- Workspace type-check: fails on the same unresolved legacy imports.
- Focused `@aker-build/github-app` tests: 36 passed.
- Focused `@aker-build/github-app-server` tests: 66 passed, 6 failed, 3 skipped. All six failures are fixture commits inheriting the developer's global SSH commit-signing configuration; the fixture repositories set identity but do not disable signing.

### Rename surface

Tracked active files still contain three legacy forms:

1. Full product/package identifiers (`TenantGuard`, `tenantguard`, `@tenantguard/*`, `.tenantguard`).
2. Internal temporary-directory prefixes (`tg-*`).
3. Live-smoke target variables (`TG_SMOKE_*`).

The evaluation source also contains literal NUL bytes in its deduplication key. TypeScript accepts them, but ordinary repository searches can classify the file as binary and silently miss the stale imports. The repaired source will use an escaped separator and the namespace guard will read files directly rather than relying on text/binary heuristics.

### Documentation drift

- `README.md` says the GitHub App is deferred, but `@aker-build/github-app` and `@aker-build/github-app-server` are implemented.
- `packages/github-app-server/README.md` says the live adapters and production entrypoint remain, but `src/octokit-api.ts`, `src/node-git.ts`, `src/http-server.ts`, and `src/bin.ts` exist with tests.
- Specs 014 and 015 still say `Draft`; their task files still say `Not started` and contain unchecked implementation work.
- `.specify/feature.json` and the active `CLAUDE.md` pointer still identify 015.
- The approved future roadmap still calls P4 the next action even though P4 and its self-hostable runtime have shipped.

## Decisions

### D1 — Fix hermeticity at fixture commits

Every temporary test repository that creates a commit must pass `-c commit.gpgsign=false` for that commit, matching the established CLI/review test pattern. This is local to test fixtures and does not alter user or production Git behavior.

### D2 — Add a dependency-free namespace guard

Create a pure Node script that:

- enumerates tracked and untracked non-ignored files with Git;
- scans explicitly defined active surfaces as UTF-8, including files containing NUL bytes;
- detects the three legacy forms without embedding those literal forms in its own source;
- reports only path, line, and matched identifier;
- supports a small exact-file historical allowlist;
- exits non-zero on any violation.

The script uses only Node built-ins, so no dependency or lockfile change is needed. Unit tests use `node:test` and are included in the root `pnpm test` command.

### D3 — Keep CI surfaces explicit

Retain the existing review and benchmark jobs. Add:

- an Ubuntu release-integrity job for namespace validation, workspace tests, and type-checking;
- a Windows first-run-smoke job for the currently documented PowerShell smoke path.

This avoids pretending the PowerShell workflow is already a platform-neutral activation surface; cross-platform one-command activation belongs to spec 017.

### D4 — Reconcile history without rewriting it

Historical Superpowers plans remain unchanged. Active docs and the 014/015 delivery records are corrected using source, tests, and commits `bacaea6`, `9f3771f`, `e6ae6aa`, `6dd1a71`, and `0445ced` as evidence. Incomplete documentation/full-suite follow-ups remain visibly open until 016 closes them.

### D5 — No product behavior change

No detector, gate, queue, prompt, review, webhook, Checks payload, schema, or write permission changes. Renaming temporary paths and smoke-only environment variables is the only externally visible naming correction; the App remains report-only and the live smoke remains opt-in.

## Rejected Alternatives

- **Rely on type-checking for namespace drift**: catches unresolved imports but misses user-facing names, temporary paths, and operator variables.
- **Use a recursive text-search command directly in CI**: ordinary search missed the current evaluation file because of its literal NUL bytes and can vary by platform/tool version.
- **Disable signing globally in CI or developer setup**: mutates environment state and leaves fixture tests non-hermetic.
- **Rewrite every historical design document**: destroys provenance and creates unrelated churn.
- **Combine npm publishing and `aker-build check` into 016**: expands the repair slice into a new distribution and CLI feature; both require their own contracts and acceptance tests.
