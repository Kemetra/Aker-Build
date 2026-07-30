# npm Release Runbook

## Current state

The repository builds and verifies `aker-build@0.1.0`. Public availability begins only after the owner completes the first-publish checklist below.

## First publish (operator-owned)

1. Recheck `https://registry.npmjs.org/aker-build` and confirm the intended npm account has two-factor authentication enabled.
2. From the reviewed `v0.1.0` release tag, run:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check:namespace
   pnpm test
   pnpm typecheck
   pnpm dlx tsx packages/eval/src/bin.ts
   node scripts/verify-cli-package.mjs --tarball-dir release
   ```

3. Inspect the verifier's `npm pack --json` evidence, then publish `release/aker-build-0.1.0.tgz` interactively with two-factor authentication and provenance.
4. Configure npm Trusted Publisher for repository `Kemetra/Aker-Build`, workflow `npm-release.yml`, and environment `npm-release`.
5. Configure required reviewers on the GitHub `npm-release` environment and do not add a long-lived npm publish token.

The manual workflow deliberately fails with a bootstrap diagnostic until the package exists. It is for trusted post-bootstrap releases, not the first registry write.

## Subsequent releases

1. Commit the version change through a reviewed spec and green CI.
2. Create protected tag `v<version>` at the reviewed commit.
3. Dispatch the `npm release` workflow from that exact tag with the same version.
4. Approve the `npm-release` environment only after preflight and package evidence are green.
5. Verify the npm provenance record and run `npx aker-build@<version> --version`.

## Rollback

npm versions are immutable. Deprecate a bad version with an explanatory message, fix forward with a new patch version, and never reuse or force-republish a version.
