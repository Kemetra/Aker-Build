# Phase 1 Quickstart: CLI Scanner

Planned usage once the scanner + CLI are implemented (after `/speckit.tasks` review). Design intent —
no code exists yet.

## Scan a repo

```bash
# Scan the current repo; writes ./.tenantguard/project-map.json (read-only on the repo)
tenantguard scan

# Scan a specific path, emit YAML, custom output dir
tenantguard scan ../some-repo --format yaml --out ./out

# Pipe the map to another tool without writing a file
tenantguard scan --stdout
```

## Show the produced map

```bash
tenantguard map                 # print ./.tenantguard/project-map.json
tenantguard map --format yaml    # render as YAML
```

## Validate the output (library)

```ts
import { validate } from "@tenantguard/project-map";
import { readFileSync } from "node:fs";

const map = JSON.parse(readFileSync(".tenantguard/project-map.json", "utf8"));
const result = validate(map);          // the scanner already validates before writing (R5)
console.log(result.ok ? "valid" : result.errors);
```

## Expected outcomes (acceptance, spec SC-001..SC-007)

| Scenario | Expected |
|----------|----------|
| Scan a multi-tenant SaaS fixture | `project-map.json` validates against 002, zero errors (SC-001) |
| Any scan | 100% of scanned repo files unchanged afterward (SC-002) |
| Inspect a populated value | traces to ≥1 detection signal; 0 fabricated values (SC-003) |
| Scan empty / non-SaaS repo | schema-valid map, empty collections, `tenant_model.status: not_detected`, no crash (SC-004) |
| Scan the same unchanged repo twice | equivalent maps, no spurious diffs (SC-005) |
| Any scan | 0 secrets in map or output (SC-006) |
| Scan offline, no creds | succeeds (SC-007) |
| Scan a non-Git dir | clear "out of MVP scope" message, exit 1 (edge case) |

## Out of scope (later specs)

- Running gates over the map (004) · queue/router (005) · prompts (006) · PR review (007).
- Exhaustive per-language static analysis (MVP = high-signal heuristics).
