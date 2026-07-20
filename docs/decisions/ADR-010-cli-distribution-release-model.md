# ADR-010: CLI Distribution and Release Model

- Status: Accepted
- Date: 2026-06-19
- Deciders: Aker Build maintainers
- Related specs: `specs/017-one-command-distribution/`

## Context

Aker Build is CLI-first. Public launch requires a credible install/run path. The blueprint and ADR-001 already choose TypeScript, Node.js LTS, pnpm, Vitest, Zod, and JSON/YAML config.

The next distribution question is how users should install and trust the CLI.

## Decision

Use npm-first distribution for the CLI.

Preferred public command shape:

```bash
npx aker-build check .
npx aker-build --help
npx aker-build scan .
npx aker-build gates .
npx aker-build queue .
npx aker-build route .
npx aker-build prompt Q-001 --agent claude
npx aker-build review-pr --local-diff
```

If the `aker-build` npm name is unavailable, use a scoped package:

```text
@aker-build/cli
```

The scoped fallback requires an explicit owner decision; automation must not change package identity silently.

The package must expose a `bin` named:

```text
aker-build
```

The release artifact is one bundled ESM package with zero production dependencies. Workspace packages and the Commander, YAML, and Zod runtime code are bundled into the executable; their license texts ship in `THIRD_PARTY_NOTICES.txt`.

## Release rules

- Public release starts at `0.1.0` only after the first-run demo passes from a clean environment.
- Release workflow is maintainer-triggered, not automatic on every merge.
- Ordinary CI builds, packs, installs, and smokes the exact artifact on Linux and Windows but never publishes it.
- The first npm publish is an operator-owned bootstrap step because npm trusted publishing cannot be configured before the package exists.
- Subsequent publication uses the approval-protected `npm-release` GitHub environment and npm trusted publishing through OIDC; no long-lived publish token is stored.
- The release workflow publishes only the tarball that passed clean-install activation checks and must not mutate user repositories.
- Changelog/release notes must list output contract changes.
- No secrets are printed in logs.
- npm provenance is required for trusted post-bootstrap releases.

## License and repo readiness

Before public release, the repository must include:

```text
LICENSE
CONTRIBUTING.md
README quickstart
first-run demo
example repo
issue labels / good first issues
```

## Rationale

- npm is the natural distribution path for a TypeScript/Node CLI.
- `npx` gives fast activation for first users.
- A global install path can come later but should not be required.
- Manual releases reduce accidental public breakage while the product is young.

## Alternatives considered

- GitHub-only clone/run: good for contributors, poor for users.
- Docker image: heavier than needed for local CLI MVP.
- Homebrew: useful later, not needed before npm traction.
- Hosted web onboarding: conflicts with CLI-first MVP boundary.

## Consequences

Positive:

- Clear public install story.
- Low-friction launch demo.
- Aligns with TypeScript ecosystem.

Costs:

- Requires package metadata, bin wiring, and clean install tests.
- Requires release discipline around semver and lockfiles.

## Non-goals

```text
No paid SaaS plans.
No hosted dashboard.
No GitHub App dependency.
No direct AI-agent execution.
```
