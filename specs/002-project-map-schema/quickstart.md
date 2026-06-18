# Phase 1 Quickstart: Project Map Schema

How a developer or a downstream capability validates a Project Map **once the schema library is
implemented** (after `/speckit.tasks` review). This document is design intent; no code exists yet.

## Validate a map (planned library usage)

```ts
import { validate, SCHEMA_VERSION } from "@tenantguard/project-map";
import { readFileSync } from "node:fs";

// JSON is canonical:
const map = JSON.parse(readFileSync("project-map.json", "utf8"));
const result = validate(map);

if (!result.ok) {
  // Each error names the offending field path + a message (FR-008).
  for (const e of result.errors) console.error(`${e.path}: ${e.message}`);
  process.exit(1);
}
console.log(`Valid Project Map (schema v${SCHEMA_VERSION}).`);
```

## Validate the YAML convenience form

```ts
import { parse as parseYaml } from "yaml";
const map = parseYaml(readFileSync("project-map.yaml", "utf8")); // parsed to the SAME object
const result = validate(map);                                    // same schema, identical meaning
```

## Expected outcomes (acceptance, from spec SC-001..SC-007)

| Input | Expected |
|-------|----------|
| `contracts/example-map.saas.yaml` | `ok: true`, zero errors (SC-001) |
| `contracts/example-map.non-saas.yaml` | `ok: true` — `not_detected` + nulls accepted, no fabrication |
| A map missing `tenant_model` | `ok: false`, error path `tenant_model` (SC-002) |
| `tenant_model.status: not_detected` with `strategy: separate_db` | `ok: false`, error on `tenant_model.strategy` (honesty invariant) |
| A map with an unknown extra field | `ok: true` — field ignored/warned, never a crash (SC-004) |
| Same map as JSON vs YAML | identical validation result (SC-005) |
| Validation run offline, no creds | succeeds (SC-007) |

## Out of scope for this feature

- Producing the map (that is `003-cli-scanner`).
- Reading the map to detect risks (that is `004-saas-gates-v0`).
- Any CLI command wiring beyond the library `validate()` surface.
