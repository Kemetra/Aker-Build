# ADR-013: Distribute consumer CI as a reusable workflow over the pinned npm CLI

- **Status:** Accepted
- **Date:** 2026-07-20
- **Context feature:** `020-reusable-github-ci`
- **Supersedes:** ADR-007 for external consumers
- **Relates:** ADR-006, ADR-007, ADR-010

## Context

Spec 008 documented a source-checkout GitHub Actions recipe because no published
CLI artifact existed. Spec 017 now builds and verifies a self-contained,
zero-production-dependency `aker-build@0.1.0` package. Requiring every consumer
to vendor this monorepo, install its workspace, and maintain a copied workflow
would preserve obsolete risk and drift.

Consumer CI also runs against pull requests that can change package scripts.
Aker Build reads source directly and does not need to execute those scripts.

## Decision

- Distribute external GitHub CI through one reusable workflow at
  `.github/workflows/aker-build-review.yml` with `workflow_call` as its only
  trigger. A consumer opts in from its own `pull_request` caller.
- Hardcode `npx --yes aker-build@0.1.0`. Expose no package-version input and run
  no consumer install, build, test, or package script.
- Require callers to pin the workflow to matching tag `v0.1.0`; recommend the
  full reviewed commit SHA for the strongest immutable reference.
- Request only `contents: read` and `pull-requests: read`, checkout the caller PR
  head with `persist-credentials: false`, and scope `github.token` to only the
  CLI steps that need `GH_TOKEN`.
- Pin every executed GitHub Action to a reviewed full commit SHA. Spec 021 pins
  checkout v6.0.2 and setup-node v6.4.0 across consumer, dogfood, and release
  workflows and requires explicit official-remote verification for updates.
- Run `doctor --github`, `scan`, and PR-number `review-pr` into the fixed
  `.aker-build` directory. Never use `--local-diff` in PR CI.
- Publish the existing Markdown review under `if: always()`. Findings remain
  report-only by default. The sole boolean input can opt into Spec 008's narrow
  critical-severity predicate; this is not the deferred P6 policy product.
- Do not comment, annotate, upload artifacts/source, commit, push, label, invoke
  agents, auto-fix, or merge.

## Rationale

- One callable workflow eliminates copy/paste command and permission drift.
- The bundled npm CLI removes all need to trust or install consumer dependencies.
- Two explicit pins make the workflow logic and executable auditable inputs.
- Full action SHAs make the workflow's own executable dependencies immutable and
  compatible with GitHub policies that reject tag-based action references.
- Callable-only delivery preserves consumer opt-in and causes no CI activation in
  this repository merely by adding the workflow file.
- The existing report contract remains the single review engine and output truth.

## Alternatives considered

- **Keep the Spec 008 copy/paste source recipe:** rejected because it installs
  workspace dependencies and asks every consumer to maintain the integration.
- **Composite or JavaScript action:** rejected because it adds packaging and a
  second integration surface without improving the fixed CLI chain.
- **Install and test the consumer first:** rejected because untrusted dependency
  scripts are outside Aker Build's read-only analysis boundary.
- **Accept a package version input or use `latest`:** rejected because executable
  resolution must be reviewable and reproducible.
- **Enable critical failure by default:** rejected because report-only remains
  the approved adoption posture and P6 is still deferred.

## Consequences

- External use begins only after npm `0.1.0` is public and the reviewed workflow
  commit is reachable at `v0.1.0` (or its full SHA).
- Aker Build's repository-specific workflow may continue running source for
  dogfood and release verification; ADR-007 remains its historical rationale.
- Local tests prove syntax, permissions, commands, policy behavior, and package
  acceptance. A live cross-repository run is an operator-owned release check.
