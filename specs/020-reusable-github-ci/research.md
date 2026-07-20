# Research: Reusable GitHub CI Integration

## R1 — Reusable workflow is the smallest distribution surface

GitHub reusable workflows live under `.github/workflows` and are invoked at the
job level with `uses`. A called workflow participates in the caller run, while
`actions/checkout` checks out the caller repository. This lets Aker Build ship
one reviewed command chain without a JavaScript/composite action or consumer
copy/paste drift.

Primary references:

- <https://docs.github.com/en/actions/concepts/workflows-and-actions/reusing-workflow-configurations>
- <https://docs.github.com/en/actions/how-tos/reuse-automations/reuse-workflows>

**Decision:** ship one `workflow_call`-only file and a minimal caller example.

## R2 — Version both distribution layers

The reusable workflow and npm executable are independent executable inputs. The
workflow therefore hardcodes `aker-build@0.1.0`, while the caller references the
matching `v0.1.0` repository tag. GitHub documents full commit SHA as the safest
workflow ref; consumer guidance recommends replacing the tag with the reviewed
SHA where policy requires immutable pinning.

**Decision:** no branch ref, `latest`, semver range, or version input.

## R3 — Consumer source must remain inert

Pull requests can contain hostile dependency scripts. Aker Build scans source
files and needs no consumer build. Installing dependencies or invoking package
scripts would widen the trust boundary without improving the review.

**Decision:** run the self-contained npm CLI through `npx --yes`; never run npm,
pnpm, yarn, bun, build, or test commands against the consumer repository.

## R4 — Read-only token and checkout boundary

The called workflow can request only permissions available to the caller; it
cannot elevate them. PR-number review needs repository and pull-request reads.
Checkout credentials are unnecessary after checkout.

**Decision:** request only `contents: read` and `pull-requests: read`, set
`persist-credentials: false`, and expose `github.token` only as step-scoped
`GH_TOKEN` for doctor/review commands.

## R5 — Keep policy explicit and narrow

The existing Spec 008 contract treats CLI errors as job failures and findings as
report-only unless the consumer opts into critical-severity enforcement. That is
already shipped behavior and does not imply the deferred P6 enforcement system.

**Decision:** one boolean input, default false; when true, exact inline Node code
counts only `finding.severity === "critical"`. Static tests execute that exact
code against empty, non-critical, and critical fixtures.

## R6 — Local proof versus live proof

Local verification can parse workflow and caller YAML, assert the security and
command contracts, execute the enforcement predicate, verify the npm tarball,
and reconstruct the command chain. It cannot prove a public cross-repository run
until npm `0.1.0` and the reviewed repository ref exist remotely.

**Decision:** local acceptance is required; publish, tag, push, and live consumer
dispatch remain an explicit operator checklist.
