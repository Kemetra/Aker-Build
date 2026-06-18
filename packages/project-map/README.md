# @tenantguard/project-map

TenantGuard's canonical, evidence-derived model of a target repository — the data contract every
downstream capability (scanner, gates, queue/router, prompt compiler, PR reviewer) reads.

Spec: [`specs/002-project-map-schema`](../../specs/002-project-map-schema/spec.md) ·
Contract: [`contracts/project-map.schema.json`](../../specs/002-project-map-schema/contracts/project-map.schema.json)

## Usage

```ts
import { validate, loadJson, loadYaml, SCHEMA_VERSION } from "@tenantguard/project-map";

const map = loadJson(jsonText);        // JSON is canonical
// const map = loadYaml(yamlText);     // YAML is an equivalent convenience form

const result = validate(map);
if (!result.ok) {
  for (const e of result.errors) console.error(`${e.path}: ${e.message}`); // field-level errors
}
```

`validate()` is pure: no network, no filesystem, no mutation. It returns
`{ ok, errors: [{ path, message }] }`.

## What it guarantees

- **Required fields** present; single- and multi-repo projects supported.
- **Tenant-model honesty** — `tenant_model.status` ∈ `detected | not_detected | unknown |
  not_applicable`; `strategy`/`tenant_key` MUST be `null` (or `strategy:"unknown"`) when not
  `detected`. No fabricated tenant values.
- **Shared Evidence Object** `{type, path, line, signal, confidence}` (`evidenceSchema`) — reused by
  downstream specs. `line`/`path` nullable; `confidence` on the evidence object. No secret-bearing
  field; unknown keys (e.g. a stray `secret`) are stripped.
- **Tolerant read** — unknown fields are ignored (forward compatibility), never a hard failure.

## Versioning & compatibility policy

`SCHEMA_VERSION` starts at `1`. Document `version` is an integer.

- **Additive** changes (new optional fields, new enum values) are **backward compatible** — older
  conforming maps stay valid; no consumer breakage.
- **Removals, renames, or redefinitions** are **breaking** and require a **major** version bump.
- **Consumers tolerate unknown fields** (forward compatibility) — a map written by a newer producer
  validates under an older consumer that reads only known fields.

See [`research.md` R5](../../specs/002-project-map-schema/research.md).

## Contract sync (JSON Schema)

The Zod schema in `src/schema.ts` is the source of truth; the JSON Schema at
`specs/002-project-map-schema/contracts/project-map.schema.json` documents the same contract for
interop. When `src/schema.ts` changes, update the JSON Schema contract in the same change (a
generated drift-check can be added later).

## Develop

```bash
pnpm test        # vitest run
pnpm typecheck   # tsc --noEmit
```
