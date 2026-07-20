# Research: Safe Repository Onboarding

## Decision 1: Close the declared MVP gap before expanding GitHub packaging

**Decision**: Implement `init` and `doctor` as Spec 019. Reusable consumer
GitHub workflow/action packaging remains the next adoption-polish candidate.

**Rationale**: `CLAUDE.md` declares `aker-build init` in MVP scope while the
shipped program has no such command. The existing CLI/config packages already
contain every dependency needed for deterministic onboarding. Closing this
contract mismatch is smaller and safer than introducing a new hosted or CI
delivery surface.

## Decision 2: Keep initialization explicit and behavior-neutral

**Decision**: Generate only config schema version 1. YAML includes commented
examples; JSON contains only `{ "version": 1 }`. Require an existing Git repo,
refuse conflicts/invalid config, and use exclusive-create writes.

**Rationale**: Inferring paths, gates, project types, or framework policy would
silently change analysis behavior. Commented examples improve discovery without
becoming policy. Exclusive create (`wx`) turns the no-overwrite promise into a
filesystem guarantee even if another process races the initial existence check.

**Rejected**:

- Interactive questions: hard to automate and unnecessary for a neutral config.
- `--force`: creates an avoidable destructive path.
- Automatic `.gitignore` edits: violates the one-file mutation contract.
- Running `git init`: expands responsibility and can surprise users.

## Decision 3: Model diagnostics once, render twice

**Decision**: `doctor` builds one `DoctorResult` and renders it as text or JSON.
The ordered checks are Node, Git, repository, config, output-ignore, and—in
GitHub mode only—`gh` and token presence.

**Rationale**: A single model prevents automation output from drifting away from
human output. Stable check identifiers make tests and future integrations
reliable without adding a public schema package in this slice.

## Decision 4: Probe commands without shell execution or network calls

**Decision**: Use `spawnSync` with argument arrays for `git --version`,
`git rev-parse --is-inside-work-tree`, `git check-ignore`, and `gh --version`.
Inject the probe, Node version, and environment-presence function in tests.

**Rationale**: Argument arrays avoid shell quoting/injection risk. All probes are
local. Dependency injection makes missing-tool, non-Git, ignore, and GitHub
states deterministic without altering the developer machine.

## Decision 5: Treat warnings as ready

**Decision**: Missing config and an unignored `.aker-build` directory are
warnings. Any `fail` check yields `needs_attention` and exit code 1; warnings
alone yield `ready` and exit 0.

**Rationale**: Zero-config behavior is an existing supported contract. The
default output is generated data and should be ignored, but doctor reports the
safe manual remediation instead of modifying `.gitignore`.

## Decision 6: Verify the bundled artifact, not only TypeScript source

**Decision**: Extend `scripts/verify-cli-package.mjs` with a temporary onboarding
fixture. Exercise bundled `init`, idempotent rerun, JSON preview, and `doctor`;
assert the sole repository change is the generated config.

**Rationale**: Spec 017 established the tarball as the real distribution unit.
An onboarding command that works only through `tsx` is not shipped behavior.
