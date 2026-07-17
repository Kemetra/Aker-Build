# ADR-010: CLI Distribution and Release Model

- Status: Proposed
- Date: 2026-06-19
- Deciders: Aker Build maintainers
- Related specs: proposed `013-npm-package-and-release-workflow`

## Context

Aker Build is CLI-first. Public launch requires a credible install/run path. The blueprint and ADR-001 already choose TypeScript, Node.js LTS, pnpm, Vitest, Zod, and JSON/YAML config.

The next distribution question is how users should install and trust the CLI.

## Decision

Use npm-first distribution for the CLI.

Preferred public command shape:

```bash
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

The package must expose a `bin` named:

```text
aker-build
```

## Release rules

- Public release starts at `0.1.0` only after the first-run demo passes from a clean environment.
- Release workflow is maintainer-triggered, not automatic on every merge.
- The release workflow may publish package artifacts, but must not mutate user repositories.
- Changelog/release notes must list output contract changes.
- No secrets are printed in logs.
- Provenance/signing may be added if the package registry setup supports it.

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
