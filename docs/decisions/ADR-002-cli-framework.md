# ADR-002: CLI Framework — Commander

- **Status**: Accepted
- **Date**: 2026-06-18
- **Deciders**: TenantGuard maintainers
- **Context tasks**: `specs/003-cli-scanner/tasks.md` T001. Resolves the "Commander or oclif" choice
  that [ADR-001](./ADR-001-tech-stack.md) deferred.

## Context

`003-cli-scanner` introduces the first real CLI commands (`tenantguard scan`, `tenantguard map`),
and the MVP will add `gates`, `queue`, `route`, `prompt`, `review-pr`, `report`. ADR-001 named the
stack but left the CLI framework open ("Commander or oclif"). A choice is needed before wiring
`packages/cli`.

## Decision

Use **Commander** for the `tenantguard` CLI.

## Rationale

- The MVP command set is small and flat — Commander is lightweight, zero-config, and ubiquitous,
  adding minimal dependency surface (aligns with CLI-First, Principle II, and the no-heavy-scaffolding
  posture).
- Commander covers everything the MVP needs: subcommands, options/flags, help/usage, argument
  validation, exit codes — see `specs/003-cli-scanner/contracts/cli-commands.md`.

## Alternatives considered

- **oclif** — powerful plugin architecture and scaffolding, suited to large, extensible CLIs with a
  plugin ecosystem. Heavier than the MVP warrants; revisit if a plugin ecosystem becomes a goal.
- **Hand-rolled `process.argv` parsing** — zero dependencies, but reinvents help/usage/validation;
  not worth it beyond two commands.

## Consequences

- **Positive**: minimal, well-understood CLI layer; fast to wire; easy for contributors.
- **Costs**: adds `commander` as a dependency to `packages/cli` (a `package.json`/lockfile change —
  approved for this build per the constitution's package-change rule).
- **Reversible**: command logic lives in the scanner library (`packages/scanner`); the CLI layer is
  thin, so switching frameworks later would be low-cost.

## References

- [ADR-001](./ADR-001-tech-stack.md) (deferred this choice).
- `specs/003-cli-scanner/research.md` R1.
- `specs/003-cli-scanner/contracts/cli-commands.md`.
- Blueprint `docs/tenantguard_project_blueprint.md` (§"Final MVP stack" — "CLI framework: Commander or oclif").
