# ADR-011: Config and Spec Adapter Boundary

- Status: Proposed
- Date: 2026-06-19
- Deciders: TenantGuard maintainers
- Related specs: proposed `011-spec-kit-adapter-and-config-boundary`

## Context

TenantGuard must be Spec Kit compatible but not Spec Kit dependent. It must work on projects with:

```text
.specify/ artifacts
plain docs
no formal specs
```

Real repos also need controlled customization: paths, repo roles, severity tuning, ignored generated files, and explicit suppressions.

Without a config boundary, the gates will be noisy. With an unsafe config boundary, users can silently turn off the tool and lose trust.

## Decision

Add a versioned local config model and a read-only Spec Kit adapter.

Config file names:

```text
tenantguard.config.json
tenantguard.config.yaml
```

JSON remains canonical; YAML is convenience.

The config can define:

```yaml
version: 1
project:
  name: example-saas
  type: monorepo
paths:
  include:
    - apps/**
  exclude:
    - dist/**
    - coverage/**
gates:
  TG-G4:
    severity: high
    suppressions:
      - id: TG-G4-EXAMPLE-001
        path: apps/demo/**
        reason: Demo fixture intentionally violates auth guard rule.
        expires: 2026-09-01
        owner: maintainer
specs:
  adapter: auto
```

Suppression rules:

- Must have reason.
- Must have path or finding id.
- Must have owner.
- Should have expiry.
- Must appear in reports as suppressed, never hidden.

Spec Kit adapter behavior:

- Read `.specify/memory/constitution.md`, `spec.md`, `plan.md`, `tasks.md`, and checklists when present.
- Convert these into project context, gates, allowed/forbidden files, prompt context, and queue hints.
- Never require Spec Kit for a successful run.
- Never mutate Spec Kit files.

## Rationale

- Spec Kit compatibility improves prompt quality and task safety.
- Config lets real projects adopt TenantGuard gradually.
- Visible suppressions keep evidence and trust intact.
- Read-only adapter respects No Hidden Mutation.

## Consequences

Positive:

- Better signal/noise on real repos.
- More useful prompts from existing specs.
- Clear path to stack presets later.

Costs:

- More schema and validation work.
- More docs needed to explain safe suppressions.

## Non-goals

```text
No plugin marketplace yet.
No remote policy registry.
No OPA/Rego engine in this slice.
No automatic changes to specs or config.
No hidden gate disabling.
```
