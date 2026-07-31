# npm Release Runbook

## Current state

`aker-build@0.1.0` is published: <https://www.npmjs.com/package/aker-build>. Verified
from the public registry with `npx --package aker-build aker --version` → `0.1.0`.

The package is `aker-build`; the command it installs is `aker`.

**This first release carries no provenance.** See "Why the first publish was manual".

## Pending operator actions

Neither is a code change and both require account access:

1. Configure npm Trusted Publishing for repository `Kemetra/Aker-Build`, workflow
   `npm-release.yml`, environment `npm-release`. This is only possible now that the
   package exists.

   Note that **linking a GitHub account to an npm account is not this.** The account link is
   identity convenience and grants the workflow nothing. Trusted Publishing is configured per
   package, at npmjs.com → `aker-build` → Settings → Trusted Publisher, and the three fields
   must match the workflow exactly. If that panel is empty, the publish step fails on auth.
2. Configure required reviewers on the release environments, then revoke the bootstrap token
   from step 2 below and remove the local `~/.npmrc` entry. Do not add a long-lived npm
   publish token to Actions secrets.

   Run `node scripts/setup-release-environments.mjs` (`--dry-run` to preview). Verified
   2026-07-31: the `npm-release` environment **did not exist**, and `pypi` existed with an
   empty `protection_rules` array. Both matter because `npm-release.yml` names an environment
   GitHub auto-creates on first use *with no protection rules* — so a dispatch would publish
   unreviewed while looking gated. Confirm with:

   ```bash
   gh api repos/Kemetra/Aker-Build/environments \
     --jq '.environments[] | {name, rules: [.protection_rules[].type]}'
   ```

Until (1) is done, `npm-release.yml` cannot authenticate: it publishes with
`id-token: write` and no token, which requires a registered publisher.

## Why `setup-node`'s `registry-url` must stay off this workflow

Two 0.1.1 release attempts failed at `npm publish` with:

```
npm error 404 Not Found - PUT https://registry.npmjs.org/aker-build
npm error 404  The requested resource 'aker-build@0.1.1' could not be found
               or you do not have permission to access it.
```

The package plainly exists, so the message is misleading twice over. npm answers an
**unauthorized** `PUT` on an existing package with `404` rather than `403` — it will not
confirm a package's existence to a caller not entitled to know — so rejected credentials
read as a missing package. And provenance signing *succeeded* in the same step, which made
the log look like OIDC was working:

```
npm notice publish Signed provenance statement with source and build information from GitHub Actions
npm notice publish Provenance statement published to transparency log: …
```

The cause was `actions/setup-node` with `registry-url`. It writes an `.npmrc` containing
`//registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}`, points `NPM_CONFIG_USERCONFIG` at it,
and — when given no token — sets `NODE_AUTH_TOKEN` to the literal placeholder
`XXXXX-XXXXX-XXXXX-XXXXX`. npm found a configured token for the registry and authenticated
with that placeholder rather than exchanging its OIDC identity, so Trusted Publishing was
never attempted. The tell is that the placeholder appears **unmasked** in the step env; a real
secret prints as `***`.

Provenance signing is unaffected because it uses the OIDC token directly and never touches the
registry, which is exactly why the log is so misleading.

`registry-url` is redundant here regardless: the generated manifest carries
`publishConfig.registry`, which `validateReleaseManifest` requires and npm honours on publish.
`scripts/release-oidc-auth.mjs` fails the build if any workflow that runs `npm publish` under
`id-token: write` sets `registry-url` again.

## Why the first publish was manual

npm can only bind a Trusted Publisher to a package that **already exists**. There is no
equivalent of PyPI's *pending* publisher, so the first release cannot come from the
workflow — the workflow has nothing to authenticate against. That is the bootstrap gap.

Two consequences learned by doing it:

- **Provenance is impossible for a first publish.** `npm publish --provenance` requires a
  supported CI environment with OIDC; it cannot run from a workstation. So the first
  release is unprovenanced by necessity, and every release after (1) above gets provenance
  automatically through the workflow.
- **A "Publish" token is not sufficient on its own.** npm requires publish-time 2FA or a
  token permitted to bypass it. With account 2FA disabled, a classic **Automation** token
  is what works; a classic **Publish** token returns
  `403 … Two-factor authentication or granular access token with bypass 2fa enabled is required`.
  A **Granular** token scoped to specific packages cannot create a package that does not
  exist yet — for a first publish it must be scoped to all packages.

## What was done for 0.1.0

1. From the reviewed `v0.1.0` tag, with a clean tree:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check:namespace
   pnpm test
   pnpm typecheck
   pnpm dlx tsx packages/eval/src/bin.ts
   node scripts/verify-cli-package.mjs --tarball-dir release
   ```

2. Authenticated with a classic **Automation** token written to `~/.npmrc` by the
   operator, never passed through a transcript or committed:

   ```bash
   npm config set //registry.npmjs.org/:_authToken=<automation-token>
   ```

3. Inspected the verifier's `npm pack --json` evidence, then:

   ```bash
   npm publish --dry-run ./release/aker-build-0.1.0.tgz   # confirm contents
   npm publish ./release/aker-build-0.1.0.tgz
   ```

   The leading `./` is required. npm parses a bare `release/aker-build-0.1.0.tgz` as a
   GitHub shorthand and attempts
   `git ls-remote ssh://git@github.com/release/aker-build-0.1.0.tgz.git`, which fails with
   a git authentication error that points nowhere near the cause.
   `scripts/release-publish-path.test.mjs` guards both release workflows against
   reintroducing the unanchored form.

## Subsequent releases

1. Commit the version change through a reviewed spec and green CI.
2. Create protected tag `v<version>` at the reviewed commit.
3. Dispatch the `npm release` workflow from that exact tag with the same version.
4. Approve the `npm-release` environment only after preflight and package evidence are green.
5. Verify the npm provenance record and run `npx aker-build@<version> --version`.

## Rollback

npm versions are immutable. Deprecate a bad version with an explanatory message, fix
forward with a new patch version, and never reuse or force-republish a version.
