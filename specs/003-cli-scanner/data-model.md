# Phase 1 Data Model: CLI Scanner

The scanner's own working entities. Its **output** is a `ProjectMap` (defined by 002,
`@tenantguard/project-map`); this model covers the scanner-internal types and detection rules.

---

## Entity: Scan Run

One invocation against a target repo path.

| Field | Type | Meaning |
|-------|------|---------|
| `targetPath` | string | Absolute path of the repo being scanned. |
| `outPath` | string | Designated output path (outside scanned tracked source; default `./.tenantguard/`). |
| `map` | ProjectMap (002) | The assembled, validated map. |
| `notes` | RunNote[] | Skips, warnings, insufficient-evidence + flagged-secret signals. |
| `readOnly` | true | Invariant — the run never mutates scanned files (FR-003). |

## Entity: Detection Signal

An observed piece of evidence justifying a map value. Serialized using the **shared Evidence Object**
from 002 (`{type, path, line, signal, confidence}`) so map annotations stay consistent across specs.

| Field | Type | Meaning |
|-------|------|---------|
| `type` | enum (002) | Usually `file` (a manifest/marker) or `missing_artifact`. |
| `path` | string \| null | The file/dir the signal came from (repo-relative). |
| `line` | int \| null | Line if applicable (often null for file-existence signals). |
| `signal` | string | e.g. `package_json_present`, `pnpm_workspace_present`, `apps_dir_monorepo`. |
| `confidence` | enum (002) | `high` for direct manifest hits; `low` for inferred/uncertain. |

## Entity: Run Note

A recorded operational event (not necessarily a map value).

| Field | Type | Meaning |
|-------|------|---------|
| `kind` | enum | `skip` \| `insufficient_evidence` \| `flagged_secret` \| `warning`. |
| `path` | string \| null | Where it occurred (repo-relative); `null` if repo-wide. |
| `message` | string | Human-readable note. **Never contains a secret value** (FR-012). |

## Detection rules (MVP — heuristic, high-signal)

| Map target (002 field) | Signal source | Confidence | Honesty rule |
|------------------------|---------------|------------|--------------|
| `project.detected_stack.runtime` | `package.json`→node, `go.mod`→go, `pyproject.toml`→python | high | `null` if no manifest (FR-006) |
| `project.detected_stack.package_manager` | `pnpm-lock.yaml`/`pnpm-workspace.yaml`→pnpm, `package-lock.json`→npm, `yarn.lock`→yarn | high | `null` if none |
| `project.detected_stack.frameworks[]` | deps in `package.json` (next, nest, express…) | high/low | `[]` if none |
| `repos[]` | root + `apps/*`,`packages/*`,`services/*` dirs with own manifest | high | single `repos:[{path:"."}]` if flat |
| `repos[].type` | heuristic (frontend dep set vs server vs worker) | low | best-effort; conservative default |
| `boundaries[]` | best-effort (often empty in MVP) | low | `[]` when none inferred |
| `tenant_model.status` | search for `tenant_id`/tenancy markers | — | `not_detected` + null strategy/key when no signal (FR-006, 002 FR-004a) |
| `critical_surfaces[]` | dir/file conventions (`migrations/`, `api/`, `webhooks/`…) | low | `[]` when none |

**Empty / non-SaaS repo** → all collections empty, `detected_stack` fields `null`/`[]`,
`tenant_model.status: not_detected`, plus a `insufficient_evidence` run note (FR-008, SC-004).

## State / lifecycle

A Scan Run is a single pass: **traverse (read-only) → collect signals → assemble map → validate
against 002 → write output + notes**. If validation fails, the run errors with the field-level errors
and writes nothing (R5). No persistent state between runs; determinism comes from stable sorting (R3),
not from stored history.
