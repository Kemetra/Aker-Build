# Tasks: One-Command Activation and Distribution

**Input**: `spec.md`, `research.md`, and the executable `plan.md` in this directory.
**Dependency**: Spec 016 must be integrated and green before production work begins.
**Status**: Implemented — release-ready; first npm publish remains operator-owned.

- [x] T001 Verify the Spec 016 integration preflight from `plan.md`.
- [x] T002 [P1] Implement and verify atomic `aker-build check [path]` orchestration (Plan Task 1).
- [x] T003 [P1] Build and validate the sanitized zero-dependency npm directory (Plan Task 2).
- [x] T004 [P1] Pack, inspect, clean-install, and smoke the exact tarball (Plan Task 3).
- [x] T005 [P2] Add non-publishing package CI and the manual protected OIDC release workflow (Plan Task 4).
- [x] T006 [P2] Reconcile activation documentation and write the operator npm runbook (Plan Task 5).
- [x] T007 Run the complete release/contract-scope verification matrix (Plan Task 6).
- [x] T008 Record release-ready status without claiming public npm availability.
- [x] T009 Commit only if explicitly authorized; never publish, push, tag, or dispatch automatically.

## Verification evidence

- Namespace integrity: 340 active files scanned; no unapproved legacy identifiers.
- Workspace verification: all package tests and all 13 TypeScript project checks passed; three credential-gated live GitHub checks remained intentionally skipped.
- Benchmark: all 15 labeled cases met every configured threshold.
- First-run smoke: passed on Windows and removed its exact temporary directory.
- Package acceptance: 21 package/preflight tests passed; the exact five-file `aker-build-0.1.0.tgz` clean-installed and produced all six `check` artifacts without mutating fixture source.
- Release boundary: ordinary CI contains no publish/OIDC/token surface; manual release uses the protected `npm-release` environment and OIDC; a branch ref fails preflight before registry access.
- Scope audit: no public contracts, schemas, gate implementations, review implementations, or generated artifacts were committed.
