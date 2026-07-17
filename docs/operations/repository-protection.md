# Repository Protection Baseline

This document describes the owner-operated settings that complement the committed CI baseline. The
files alone do not enable branch protection.

## Required checks

After each job has completed successfully at least once on GitHub, protect `main` and require:

```text
Quality (minimum-node)
Quality (linux-lts)
Quality (windows-lts)
Quality (macos-lts)
benchmark
dependency-audit
codeql
```

Require the branch to be up to date before merging and require CODEOWNER review where the repository
plan supports it. Do not enable automatic merge as part of this baseline.

`Advisory dogfood review` remains advisory: Aker Build findings report evidence but are not a required
merge-enforcement surface. The optional `AKER_BUILD_FAIL_ON_CRITICAL` variable is owner-controlled and
is not set by 016.

## CodeQL setup

The repository commits an advanced CodeQL workflow. Before its first trusted run, check whether
GitHub CodeQL default setup is already active. Keep exactly one setup: if default setup is active,
the owner must disable the duplicate before relying on the committed advanced workflow. Do not solve
a setup conflict by broadening workflow permissions or ignoring failure.

## Owner verification

- Confirm every required check has a successful hosted run.
- Enable the checks in repository settings and confirm a test pull request cannot merge while one is
  failing.
- Confirm `.github/CODEOWNERS` resolves to the `@Kemetra` GitHub user.
- Review Dependabot proposals; never auto-merge them without the normal test/security review.

Until these settings are confirmed in GitHub, describe the repository as having a committed
protection baseline, not completed operational branch protection.
