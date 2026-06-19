# ADR-009: Output Contract and Report Versioning

- Status: Proposed
- Date: 2026-06-19
- Deciders: TenantGuard maintainers
- Related specs: proposed `012-output-contract-and-report-versioning`

## Context

TenantGuard's value is carried by generated artifacts:

```text
project-map.json
risks.json
queue.json
route.json
prompt-<id>.md
review.json
review.md
tenantguard-report.json
tenantguard-report.md
```

Once users install the CLI or run it in CI, these artifacts become external contracts. If fields drift silently, prompts, CI summaries, and downstream automation become unreliable.

## Decision

Use versioned JSON contracts as the canonical output format.

Markdown reports are human-facing renderings of canonical JSON. They may change in layout more freely, but they must not contradict the JSON source.

Each public JSON artifact must include:

```json
{
  "schemaVersion": "1.0",
  "generatedAt": "ISO-8601 timestamp",
  "source": {
    "repoPath": "string or redacted",
    "commit": "string or null",
    "dirty": true
  }
}
```

Breaking changes require:

1. an ADR or migration note,
2. updated schema fixtures,
3. backward-compatibility decision,
4. tests proving old/new behavior where applicable.

## Rationale

- TenantGuard's credibility depends on evidence and reproducibility.
- AI-agent prompts need stable inputs.
- CI integration needs stable machine-readable outputs.
- Versioned schemas make launch support and bug reports easier.

## Contract surfaces

| Artifact | Canonical? | Version required? | Notes |
|---|---:|---:|---|
| `project-map.json` | Yes | Yes | Already schema-heavy; remains central. |
| `risks.json` | Yes | Yes | Must carry evidence for each finding. |
| `queue.json` | Yes | Yes | Must carry lock scope, gates, validation, stop conditions. |
| `route.json` | Yes | Yes | Must explain selected and blocked items. |
| `review.json` | Yes | Yes | Must explain Ready / Not Ready / Needs Verification. |
| `tenantguard-report.json` | Yes | Yes | Aggregate source for Markdown report. |
| `*.md` reports | No | Optional frontmatter | Human-facing rendering. |
| `prompt-<id>.md` | No | Include metadata comment | Copy-paste artifact, not a data API. |

## Consequences

Positive:

- Makes CI and integrations safer.
- Gives tests clear fixture targets.
- Helps users report bugs with artifact versions.

Costs:

- Adds maintenance burden for schemas and fixtures.
- Requires discipline before changing output shapes.

## Non-goals

```text
No remote telemetry.
No hosted report ingestion.
No SaaS dashboard schema yet.
No backward compatibility promise before v0.1 unless explicitly stated.
```
