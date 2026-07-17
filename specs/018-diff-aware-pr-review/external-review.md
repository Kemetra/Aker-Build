# 018 Owner-Delegated External Review

**Reviewer posture**: Independent release/contract review requested by the owner
**Date**: 2026-07-17
**Decision**: Approved for test-first implementation after corrections

## Approaches reviewed

1. **Two snapshots + one comparison core (approved):** highest cost but the only approach that treats
   untracked work, App checkouts, duplicate findings, and old debt consistently.
2. **Changed-file/line filtering of head findings (rejected):** cannot distinguish moved/existing debt
   or resolved findings and repeats the current false attribution defect.
3. **Git blame/history heuristics (rejected):** diverges for untracked work and shallow/App checkouts,
   and confuses authorship with semantic introduction.

## Blocking ambiguities corrected

- GitHub patch text is not required for correctness; base/head trees produce the diff locally, so
  truncated or absent API patches cannot yield a false ready result.
- App comparison requires two tracked workspaces and a validated webhook base SHA. Base/head source,
  raw bodies, and patch text never cross IPC.
- Local working-tree comparison archives HEAD then overlays only Git-reported, contained regular
  files. Symlinks, submodules, LFS ambiguity, archive/diff failure, or missing objects are fixed
  incompleteness—not best-effort ready.
- `findingId` stays byte-compatible for suppressions. The new fingerprint is transient,
  comparison-only, source-bounded, and digest-only.
- Duplicate statements are a multiset; classification never keys a result in a single-value map.
- v1 validation/rendering is frozen while v2 is the sole new producer contract. Report migration is
  part of 018, not deferred to a later consumer break.
- Annotation eligibility and verdict contribution are separate: worsened config attributes can
  affect verdict without falsely pinning an unchanged source line.

## Approval boundary

The plan is approved only for 018 comparison/schema/adapters. Detector coverage, framework packs,
Project Map coverage, enforcement, mutation, dashboards, external queues, and release work remain
forbidden. Hosted Action/App parity remains operator evidence.

## Implementation review evidence (local)

The implementation preserves the approved rejection checklist:

- v1 reports remain accepted and rendered; v2 is the only normal local, CLI PR, Action, and App
  producer contract.
- SHA-256 context fingerprints are bounded and comparison-only; the public `findingId` remains the
  suppression key.
- Classification pairs duplicate findings as a multiset, and an unchanged source line cannot gain an
  inline annotation merely because another attribute worsened.
- Git snapshots use resolved object IDs and owned archive directories. Local working-tree overlay,
  no-index diff parsing, symlink/submodule/LFS checks, cleanup, and unavailable object paths close
  to fixed incompleteness rather than a pass.
- The App validates both webhook SHAs, checks out base and head separately, derives its own diff,
  and disposes both workspaces plus snapshots. GitHub patch and changed-files APIs are no longer a
  correctness dependency.

Review defects found and corrected during implementation:

1. Deleted-file no-index headers could select the wrong path; the parser now uses a safe destination
   fallback.
2. Missing Git refs could expose command stderr; Git subprocesses now suppress that detail and emit
   fixed incomplete reasons.
3. The original App path used one checkout and GitHub changed files; it now uses validated base/head
   workspaces and the shared comparison engine.
4. The server composition root retained an unused single-checkout preparation dependency; it was
   removed so production cannot accidentally route through the legacy v1 seam.
5. The CLI now rejects `--base` in PR-number mode rather than silently ignoring it.

Pending evidence is deliberately unchanged: credentialed registered-App smoke, hosted Action
execution, and container build remain operator/hosted verification, not local claims.

### Final local verification (2026-07-17)

- Focused regression checks passed: CLI review (10 tests), App-server degradation (6 tests), and
  their TypeScript typechecks.
- Full changed-package verification passed: review (85 tests), report (5 tests), and GitHub App
  (44 tests), all with typechecks; the full App-server suite also passed (124 tests, 3 explicitly
  credential-gated skips).
- Workspace `pnpm test` and `pnpm typecheck` passed. The root intentionally has no `build` script;
  every declared package build passed through `pnpm -r --if-present run build`.
- `pwsh -NoProfile -File scripts/smoke-first-run.ps1 -RemoveTemp` passed, including the v2 local
  comparison producing a genuine not-ready result for its controlled unsafe out-of-scope change.
- `pnpm audit --prod` reported no known vulnerabilities. `git diff --check` passed, and a source
  secret-pattern scan excluding test fixtures found no candidate credentials.
