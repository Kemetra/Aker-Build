# Immutable GitHub Action Pins Implementation Plan

> **Execution:** Superpowers plan execution with test-driven development.

**Goal:** Make every external action executed by this repository immutable and
ensure checkout credentials are never persisted.

**Architecture:** Extend the existing parsed-YAML workflow contract test to
discover all workflow files, allowlist exact action SHAs, count all references,
and validate every checkout. Then mechanically replace action tags and add
missing checkout options without changing workflow behavior.

## Task 1: RED Contract

- Extend `packages/cli/tests/ci-workflow.test.ts` with workflow enumeration and
  assertions for exactly three YAML files and 14 step `uses`.
- Require a 40-character SHA, exact checkout/setup-node allowlist values, and
  `persist-credentials: false` on every checkout.
- Run the focused test and retain failures against the current tag refs and
  credential-persisting historical jobs.

## Task 2: GREEN Workflow Hardening

- Replace every checkout/setup-node tag in all three workflows with the approved
  full SHA plus version comment.
- Add `with.persist-credentials: false` to every checkout lacking it.
- Rerun focused tests/typecheck and inspect a semantic before/after projection to
  prove triggers, permissions, jobs, commands, inputs, and Node versions did not
  change.

## Task 3: Documentation and Verification

- Record immutable pins/update procedure in the consumer guide and ADR-013.
- Run namespace, workspace tests/typecheck, package acceptance, benchmark,
  first-run smoke, diff check, and exact scope audit.
- Record evidence, mark implemented, commit, fast-forward the local integration
  branch, and rerun the integrated workspace suite. Do not push.

## Stop Conditions

- A job needs persisted credentials or a non-allowlisted action.
- Pinning requires a workflow behavior, permission, manifest, lockfile, product
  source, self-hosted runner, or remote change.
