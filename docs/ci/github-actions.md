# GitHub Actions

Use Aker Build's reusable workflow to review pull requests without installing or
running the consumer repository's dependencies. The workflow is report-only by
default: findings appear in the run summary, while execution/preflight errors
still fail the job.

## Consumer workflow

Create `.github/workflows/aker-build.yml` in the consumer repository:

<!-- consumer-workflow:start -->
```yaml
name: Aker Build
on:
  pull_request:

permissions:
  contents: read
  pull-requests: read

jobs:
  review:
    uses: Kemetra/Aker-Build/.github/workflows/aker-build-review.yml@v0.1.0
    with:
      fail-on-critical: false
```
<!-- consumer-workflow:end -->

`v0.1.0` is the readable release pin. For an immutable production pin, replace
it with the full reviewed commit SHA. Do not use a branch or `latest`.

The example becomes runnable only after the owner publishes npm package
`aker-build@0.1.0` and creates the reviewed `v0.1.0` repository tag. The
consumer's GitHub Actions policy must also allow the referenced public reusable
workflow.

## Optional critical-only failure

Set `fail-on-critical: true` to fail only when `review.json` contains at least
one finding whose severity is `critical`. High and medium findings, and a
`not_ready` verdict without a critical finding, remain reported without failing
the job. This preserves the narrow Spec 008 rule; it is not the deferred P6
enforcement/override product.

## Security boundary

- The called workflow requests only `contents: read` and
  `pull-requests: read`; caller permissions can restrict but cannot elevate it.
- Checkout targets the caller PR head and does not persist credentials.
- The exact self-contained package is invoked with
  `npx --yes aker-build@0.1.0`. No consumer dependency install, build, test, or
  package script runs.
- `github.token` is exposed only as step-scoped `GH_TOKEN` for GitHub preflight
  and PR-number review. It is not accepted as an input or stored.
- The workflow writes only `.aker-build` files in the ephemeral runner and the
  GitHub step summary. It does not upload source/artifacts or commit, push,
  annotate, label, or comment.

## Command and result contract

The called workflow runs this fixed sequence over the checked-out caller:

```text
doctor . --github
scan . --out .aker-build
review-pr <PR number> --out .aker-build
```

PR-number mode is required because it obtains the changed-file set relative to
the PR base. `--local-diff` would inspect only uncommitted working-tree changes
and is therefore invalid in this CI flow. The summary step always runs: it
appends `.aker-build/review.md` when available and otherwise points to the failed
step logs.

## Operational ownership

Publishing npm `0.1.0`, creating/pushing the reviewed `v0.1.0` tag, validating a
live cross-repository run, and enabling the caller workflow are operator-owned
actions. Local repository verification does not perform any of them.
