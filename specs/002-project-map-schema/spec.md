# Feature Specification: Project Map Schema

**Feature Branch**: `002-project-map-schema`
**Created**: 2026-06-18
**Status**: Approved (foundation — reviewed 2026-06-18)
**Input**: User description: "Define the versioned Project Map schema and the required JSON/YAML outputs for TenantGuard. Depends on 001-product-foundation. Docs only; no production code."

**Depends on**: `001-product-foundation`
**Blocks**: `003-cli-scanner` (scanner must emit this schema), `004-saas-gates-v0` (gates read it),
`005-derived-queue-router` (queue/router consume it)

---

## Purpose *(mandatory)*

The Project Map is TenantGuard's canonical, evidence-derived model of a target repository. Every
later capability — gates, derived queue, router, prompt compiler, PR review — reads the Project Map.
This feature defines the **logical schema** (required and optional fields, their meaning, value
domains) and the **required serialized outputs** (`project-map.json`, and a YAML form for human
authoring/inspection).

This spec defines the *contract*, not the scanner that fills it (that is `003-cli-scanner`) and not
the checks that read it (that is `004-saas-gates-v0`). The field names are the binding product
surface; downstream specs depend on them.

---

## User Scenarios & Testing *(mandatory)*

"Users" are the downstream TenantGuard capabilities and the developers who read/author the map.

### User Story 1 - Produce a canonical map of a repo (Priority: P1)

A developer (via the scanner) produces a `project-map.json` that captures detected stack, repos/areas,
boundaries, tenant model, and critical surfaces — with a schema version stamped on it.

**Why this priority**: Without a stable, versioned contract there is nothing for gates, queue, or
router to read. This is the foundational data structure of the whole product.

**Independent Test**: Validate a hand-authored example map against the schema and confirm it is
accepted; confirm a map missing a required field is rejected with a clear error pointing at the field.

**Acceptance Scenarios**:

1. **Given** a conforming map, **When** it is validated against the schema, **Then** validation passes.
2. **Given** a map missing a required field, **When** it is validated, **Then** validation fails and
   names the missing field and its location.
3. **Given** a conforming map, **When** it is serialized, **Then** it is available as both
   `project-map.json` and an equivalent YAML form with identical meaning.

### User Story 2 - Evolve the schema without breaking consumers (Priority: P2)

A maintainer adds a new optional field to the schema and bumps the schema version; existing maps and
consumers keep working.

**Why this priority**: The map is consumed by many later specs. A versioning + compatibility policy
is what makes the dependency chain safe to evolve.

**Independent Test**: Add an optional field, increment the schema version per the policy, and confirm
an older conforming map still validates and a consumer reading only known fields is unaffected.

**Acceptance Scenarios**:

1. **Given** a schema version bump that only adds optional fields, **When** an older map is validated,
   **Then** it still passes (backward compatible).
2. **Given** a map with an unknown extra field, **When** validated under a tolerant-read policy,
   **Then** the unknown field is ignored or surfaced as a warning, never a hard crash.

### User Story 3 - Inspect the map by hand (Priority: P3)

A reviewer opens the YAML form of the map to understand a repo's boundaries and tenant model without
reading code.

**Why this priority**: Human readability supports the "source truth first" and review principles.

**Independent Test**: Open the example YAML map and confirm a reviewer can identify the tenant
strategy, the architecture boundaries, and the critical surfaces from the document alone.

---

### Edge Cases

- **Empty / non-SaaS repo**: the map MUST still be schema-valid with empty collections (e.g. no
  detected frameworks, no boundaries) rather than being absent or malformed.
- **Unknown stack**: when the stack cannot be detected, stack fields are present but explicitly empty
  or `null`, never fabricated.
- **Multiple repos/areas**: the schema MUST represent more than one repo/area (mono- or multi-repo).
- **Conflicting evidence**: where detection is uncertain, the map MUST be able to mark a value as
  low-confidence or unverified rather than asserting it.
- **Unknown future field**: consumers MUST tolerate unknown fields (forward compatibility).

---

## Schema Definition *(mandatory)*

The Project Map is a single document with these top-level sections. (Types are logical; serialization
is JSON and YAML.)

### Required top-level fields

- **version** (integer/string): schema version of this map document. Drives the compatibility policy.
- **project**: object describing the overall project.
  - **name** (string)
  - **detected_stack**: object — `runtime`, `package_manager`, `frameworks[]`. Fields present even
    when empty/unknown (empty list or `null`), never fabricated.
- **repos[]**: list of repos/areas. Each item:
  - **name** (string), **path** (string), **type** (enum: `backend` | `frontend` | `worker` |
    other named type), **owns[]** (list of capability tags, e.g. `auth`, `tenants`, `billing`).
- **boundaries[]**: list of architecture boundary rules. Each item:
  - **id** (string, e.g. `B-001`), **rule** (machine-readable key), **description** (human text).
- **tenant_model**: object describing multi-tenancy.
  - **status** (enum, required): `detected` | `not_detected` | `unknown` | `not_applicable`.
    Records whether a tenant model was found, explicitly absent, undeterminable, or out of scope
    for this repo — so non-SaaS or single-tenant repos are represented honestly instead of fabricated.
  - **strategy** (enum **or `null`**, e.g. `shared_db_shared_schema` | `shared_db_separate_schema` |
    `separate_db` | `unknown`): MUST be `null` (or `unknown`) when `status` is not `detected`.
    A value MUST NOT be guessed.
  - **tenant_key** (string **or `null`**, e.g. `tenant_id`): MUST be `null` when `status` is not
    `detected`. A value MUST NOT be fabricated.
  - **required_surfaces[]** (list of surfaces that must carry tenant scoping; MAY be empty when no
    tenant model is detected).
- **critical_surfaces[]**: list of high-risk surfaces (e.g. `api_routes`, `db_migrations`,
  `background_jobs`, `webhooks`, `billing_usage`, `auth_guards`).

### Optional fields

- Per-value **evidence** annotations where detection is uncertain — supports "evidence-based" and
  "needs verification." These use the shared **Evidence Object** shape defined below.
- Project-level metadata (description, generated-at timestamp) that does not change meaning.

### Shared Evidence Object *(normative — referenced by downstream specs)*

A single, reusable shape for any evidence citation across TenantGuard (map annotations, gate
findings, queue items, prompt context). Downstream specs MUST reference this shape rather than
redefine their own:

| Field | Type | Required | Meaning |
|-------|------|----------|---------|
| `type` | enum | yes | Kind of evidence: `file` \| `line` \| `changed_file` \| `missing_artifact` \| `failed_command` \| `pr_metadata` \| `ci_status` \| `spec_file`. |
| `path` | string \| null | yes | Repo-relative path the evidence points at; `null` when the evidence has no path (e.g. a failed command or CI status). |
| `line` | integer \| null | no | Line number where applicable; `null`/absent for path-less or whole-file evidence. MUST NOT be fabricated. |
| `signal` | string | yes | Short machine/human key describing what was observed (e.g. `route_without_auth_guard`, `dropped_column`). |
| `confidence` | enum | yes | Detection confidence: `high` \| `medium` \| `low`. Uncertain detections use `low` rather than asserting. |

Notes:
- `confidence` lives on the **evidence object** (one canonical home), not duplicated elsewhere.
- An evidence object MUST NOT contain secrets or credential values (see FR-011); `signal`/`path`
  describe *where/what*, never the secret itself.

### Illustrative example (non-normative)

```yaml
version: 1
project:
  name: example-saas
  detected_stack:
    runtime: node
    package_manager: pnpm
    frameworks:
      - nextjs
      - nestjs
repos:
  - name: api
    path: apps/api
    type: backend
    owns: [auth, tenants, billing, jobs]
  - name: web
    path: apps/web
    type: frontend
    owns: [admin-ui]
  - name: worker
    path: apps/worker
    type: worker
    owns: [async-jobs]
boundaries:
  - id: B-001
    rule: frontend_calls_api_only
    description: Frontend must not call the database directly.
  - id: B-002
    rule: worker_has_no_public_routes
    description: Worker must not expose public HTTP endpoints unless explicitly approved.
tenant_model:
  status: detected
  strategy: shared_db_shared_schema
  tenant_key: tenant_id
  required_surfaces: [api_routes, db_queries, background_jobs, reports]
critical_surfaces: [api_routes, db_migrations, background_jobs, webhooks, billing_usage, auth_guards]
```

### Illustrative example — non-SaaS / no tenant model detected (non-normative)

A repo with no detectable multi-tenancy is still schema-valid: collections are empty and the tenant
model is marked `not_detected` with `null` values, never fabricated.

```yaml
version: 1
project:
  name: example-cli-tool
  detected_stack:
    runtime: node
    package_manager: pnpm
    frameworks: []
repos:
  - name: root
    path: .
    type: backend
    owns: []
boundaries: []
tenant_model:
  status: not_detected
  strategy: null
  tenant_key: null
  required_surfaces: []
critical_surfaces: []
```

---

## Requirements *(mandatory)*

### Functional Requirements

**Structure**

- **FR-001**: The schema MUST define all required top-level fields above (`version`, `project`,
  `repos`, `boundaries`, `tenant_model`, `critical_surfaces`) with their meaning and value domains.
- **FR-002**: The schema MUST represent single-repo and multi-repo/area projects.
- **FR-003**: `detected_stack` fields MUST always be present even when empty or unknown; the schema
  MUST NOT require fabricated values.
- **FR-004**: The schema MUST allow per-value evidence annotations (using the shared Evidence Object)
  so uncertain detections can be marked rather than asserted.
- **FR-004a**: `tenant_model.status` MUST be one of `detected` | `not_detected` | `unknown` |
  `not_applicable`. When `status` is not `detected`, `strategy` and `tenant_key` MUST be `null` (or
  `unknown` for `strategy`); the schema MUST NOT require or permit fabricated tenant values.
- **FR-004b**: The schema MUST define a single shared Evidence Object shape
  (`type`, `path`, `line`, `signal`, `confidence`) with `line` optional/nullable and `confidence`
  carried on the evidence object. Downstream specs MUST reuse this shape rather than redefine it.

**Versioning & compatibility**

- **FR-005**: Every map document MUST carry a schema `version`.
- **FR-006**: The spec MUST state a compatibility policy: additive (new optional fields) changes are
  backward compatible; field removals/renames/redefinitions are breaking and require a major bump.
- **FR-007**: Consumers MUST tolerate unknown fields (forward compatibility) rather than failing hard.

**Validation & outputs**

- **FR-008**: A conforming map MUST validate successfully; a non-conforming map MUST fail validation
  with an error that names the offending field and its location.
- **FR-009**: The map MUST be producible as `project-map.json` (machine-readable) and as an equivalent
  YAML form (human-readable) with identical meaning.
- **FR-010**: Validation MUST NOT require network access or credentials.

**Safety & scope**

- **FR-011**: The map MUST NOT contain secrets or credentials; any secret-like value encountered
  during population MUST be excluded and flagged, never stored in the map.
- **FR-012**: The schema MUST be domain-neutral — no Retail Tower, ERPNext, or POS-specific fields.

### Key Entities

- **Project Map**: the whole document (version + project + repos + boundaries + tenant_model +
  critical_surfaces).
- **Repo/Area**: one codebase or area within the project, with type and owned capabilities.
- **Boundary**: an architecture rule the project must respect (id, rule key, description).
- **Tenant Model**: how multi-tenancy is structured (strategy, tenant key, required surfaces).
- **Critical Surface**: a high-risk area gates pay special attention to.
- **Evidence Object** (shared): the canonical `{type, path, line, signal, confidence}` shape used
  for any evidence citation, here and in downstream specs (gates, queue, prompts). Optional as a
  per-value annotation on the map; mandatory wherever a downstream spec emits a finding.

---

## Required Outputs *(mandatory)*

```text
project-map.json   canonical machine-readable Project Map (this schema)
project-map.yaml   equivalent human-readable form (optional to emit, identical meaning)
```

Both MUST validate against the same schema and represent the same logical map.

---

## Non-Goals *(mandatory)*

```text
- The scanner that populates the map (that is 003-cli-scanner).
- The gate checks that read the map (that is 004-saas-gates-v0).
- A database or persistence layer for maps (JSON/YAML files are the contract).
- A UI or dashboard view of the map.
- Cross-repo dependency graphs beyond the boundaries list.
- Choosing a specific schema-validation library or serializer (decided at plan layer).
- Retail Tower / ERPNext / POS-specific schema fields.
```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A hand-authored conforming example map validates with zero errors.
- **SC-002**: A map missing any required field fails validation, and 100% of such failures name the
  specific missing field.
- **SC-003**: An additive-only schema version bump keeps 100% of previously-conforming maps valid.
- **SC-004**: A map containing an unknown extra field is read by a consumer without a hard failure.
- **SC-005**: The same logical map round-trips between JSON and YAML with no loss of meaning.
- **SC-006**: 0 secrets appear in any produced map.
- **SC-007**: Map validation completes with no network access or credentials.

---

## Acceptance Criteria for This Feature *(mandatory)*

- **AC-001**: All required top-level fields are defined with meaning and value domains.
- **AC-002**: A versioning and backward/forward compatibility policy is stated.
- **AC-003**: Required outputs (`project-map.json`, YAML form) are specified.
- **AC-004**: Validation behavior (pass/fail + field-level errors) is specified.
- **AC-005**: A non-normative example map is included and is internally consistent with the schema,
  including a non-SaaS example where `tenant_model.status` is `not_detected` with `null` values.
- **AC-005a**: `tenant_model.status` and the null-when-not-detected rule for `strategy`/`tenant_key`
  are specified, so non-SaaS / single-tenant / undeterminable repos are represented without fabrication.
- **AC-005b**: The shared Evidence Object shape (`type`, `path`, `line`, `signal`, `confidence`) is
  defined once here and declared as the shape downstream specs reuse.
- **AC-006**: Non-goals are explicit (scanner, gates, persistence, UI, library choice).
- **AC-007**: The schema is domain-neutral and secret-free.
- **AC-008**: The spec is implementation-neutral on serializer/validator choice (deferred to plan).
- **AC-009**: No production code, schema-validation code, `package.json`, or lockfile is created.

---

## Assumptions

- **Serializer/validator choice deferred** to the plan/ADR layer. The blueprint proposes JSON+YAML
  with Zod-based validation; this spec mandates the *contract and behavior*, not the library.
- **JSON is canonical, YAML is convenience.** Where the two could differ, the JSON form is
  authoritative; the YAML form must carry identical meaning.
- **Version field** starts at `1` for the initial schema; the compatibility policy governs increments.
- **Enum value sets** (repo `type`, tenant `strategy`) are extensible — the listed values are the
  initial set, not a closed universe, and new values are additive (non-breaking).
- **Capability tags** in `owns[]` and the surface names are conventional strings, refined as gates
  (`004`) are specified; their exact vocabulary is not frozen by this feature.
