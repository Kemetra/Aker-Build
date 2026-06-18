# Phase 1 Data Model: Project Map Schema

Logical data model for the Project Map. Types are logical (serialized as JSON, mirrored in YAML).
This is the design realization of the spec's Schema Definition — it does not introduce new product
surface beyond the approved spec.

---

## Entity: Project Map (root document)

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `version` | integer | yes | Schema version of this document. Starts at `1`. Drives the compatibility policy (R5). |
| `project` | Project | yes | The overall project (see below). |
| `repos` | Repo[] | yes | ≥0 repos/areas. MAY be empty (empty repo) but the key is present. |
| `boundaries` | Boundary[] | yes | ≥0 architecture boundary rules. MAY be empty. |
| `tenant_model` | TenantModel | yes | Multi-tenancy description (see below). |
| `critical_surfaces` | string[] | yes | High-risk surface tags (e.g. `api_routes`, `db_migrations`). MAY be empty. |
| `metadata` | Metadata | no | Non-meaning project metadata (description, generated_at). |

**Tolerant read**: unknown top-level (or nested) fields are ignored / surfaced as a warning, never a
hard failure (FR-007). Validation operates on the parsed object regardless of JSON or YAML origin.

## Entity: Project

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `name` | string | yes | Project name. |
| `detected_stack` | DetectedStack | yes | Always present even when empty/unknown (FR-003). |

### DetectedStack

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `runtime` | string \| null | yes | e.g. `node`; `null` when undetected — never fabricated. |
| `package_manager` | string \| null | yes | e.g. `pnpm`; `null` when undetected. |
| `frameworks` | string[] | yes | e.g. `[nextjs, nestjs]`; empty list when none detected. |

## Entity: Repo / Area

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `name` | string | yes | Repo/area name. |
| `path` | string | yes | Repo-relative path (e.g. `apps/api`, `.`). |
| `type` | enum | yes | `backend \| frontend \| worker \| <other named type>`. Enum is **extensible** (additive values non-breaking). |
| `owns` | string[] | yes | Capability tags (e.g. `auth`, `tenants`, `billing`). MAY be empty. |

## Entity: Boundary

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `id` | string | yes | Stable id, e.g. `B-001`. |
| `rule` | string | yes | Machine-readable rule key, e.g. `frontend_calls_api_only`. |
| `description` | string | yes | Human description. |

## Entity: TenantModel  *(honesty rule — FR-004a)*

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `status` | enum | yes | `detected \| not_detected \| unknown \| not_applicable`. |
| `strategy` | enum \| null | yes | `shared_db_shared_schema \| shared_db_separate_schema \| separate_db \| unknown \| null`. **MUST be `null` (or `unknown`) when `status !== "detected"`.** Extensible enum. |
| `tenant_key` | string \| null | yes | e.g. `tenant_id`. **MUST be `null` when `status !== "detected"`.** Never fabricated. |
| `required_surfaces` | string[] | yes | Surfaces that must carry tenant scoping. MAY be empty when no model detected. |

**Conditional invariant** (enforced in validation): if `status` is `not_detected | unknown |
not_applicable`, then `strategy ∈ {null, "unknown"}` and `tenant_key === null`. A non-null guessed
value with a non-`detected` status is a validation error naming `tenant_model.strategy` /
`tenant_model.tenant_key`.

## Shared Entity: Evidence Object  *(normative — reused by 004/005/006/007 — FR-004b)*

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `type` | enum | yes | `file \| line \| changed_file \| missing_artifact \| failed_command \| pr_metadata \| ci_status \| spec_file`. |
| `path` | string \| null | yes | Repo-relative path; `null` for path-less evidence (failed command, CI status). |
| `line` | integer \| null | no | Line where applicable; `null`/absent otherwise. **Never fabricated.** |
| `signal` | string | yes | Short key for what was observed, e.g. `route_without_auth_guard`, `dropped_column`. |
| `confidence` | enum | yes | `high \| medium \| low`. Uncertain detections use `low`. |

**Secret safety**: an Evidence Object MUST NOT contain a secret value; `signal`/`path` describe
*where/what*, never the secret itself (FR-011). The map has no secret-bearing field by design (R7).

**Usage in the map**: Evidence Objects appear as *optional per-value annotations* where a detected
value is uncertain (e.g. annotating a low-confidence `tenant_model` or a detected framework). They
are mandatory wherever a downstream spec emits a finding.

## Entity: Metadata *(optional)*

| Field | Type | Required | Rule |
|-------|------|----------|------|
| `description` | string | no | Human description; no meaning change. |
| `generated_at` | string (ISO-8601) | no | Timestamp; provenance only. |

---

## Validation behavior (design)

- `validate(map): { ok: boolean, errors: Array<{ path: string, message: string }> }`.
- Required-field absence → `ok:false` with an error naming the field path (FR-008, SC-002).
- Conditional tenant-model invariant violation → error on the specific field.
- Unknown fields → ignored or warning, never failure (FR-007, SC-004).
- No network, no credentials, no file mutation (FR-010, Principle VI).

## State / lifecycle

The Project Map is a **stateless document** — no lifecycle transitions. It is produced (by 003),
validated (this feature's validator), and read (by 004–007). Evolution is governed by the `version`
field + compatibility policy (R5), not by per-document state.
