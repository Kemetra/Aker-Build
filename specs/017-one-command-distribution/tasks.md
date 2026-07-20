# Tasks: One-Command Activation and Distribution

**Input**: `spec.md`, `research.md`, and the executable `plan.md` in this directory.
**Dependency**: Spec 016 must be integrated and green before production work begins.
**Status**: Implementation in progress — Spec 016 integrated at `eaf53aa` and preflight verified.

- [x] T001 Verify the Spec 016 integration preflight from `plan.md`.
- [x] T002 [P1] Implement and verify atomic `aker-build check [path]` orchestration (Plan Task 1).
- [x] T003 [P1] Build and validate the sanitized zero-dependency npm directory (Plan Task 2).
- [x] T004 [P1] Pack, inspect, clean-install, and smoke the exact tarball (Plan Task 3).
- [x] T005 [P2] Add non-publishing package CI and the manual protected OIDC release workflow (Plan Task 4).
- [x] T006 [P2] Reconcile activation documentation and write the operator npm runbook (Plan Task 5).
- [ ] T007 Run the complete release/contract-scope verification matrix (Plan Task 6).
- [ ] T008 Record release-ready status without claiming public npm availability.
- [ ] T009 Commit only if explicitly authorized; never publish, push, tag, or dispatch automatically.
