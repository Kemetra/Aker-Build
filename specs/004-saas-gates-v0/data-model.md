# Phase 1 Data Model: SaaS Gates v0

Entities, the `risks.json` shape, and the per-gate v0 signal set. Grounded in the **real exported
shape** of `@aker-build/project-map` (`evidenceSchema`), not paraphrase. No code is created here; this
is the contract the implementation (after review) must satisfy.

---

## Shared Evidence Object (imported, NOT redefined)

Reused verbatim from `@aker-build/project-map` (`evidenceSchema`). For reference, its real shape:

```text
Evidence {
  type: "file" | "line" | "changed_file" | "missing_artifact" | "failed_command"
      | "pr_metadata" | "ci_status" | "spec_file"
  path: string | null
  line?: number | null          # int, optional
  signal: string                # human-readable signal name (no secret values)
  confidence: "high" | "medium" | "low"
}
```

Gates **import** `evidenceSchema` and MUST NOT define a divergent evidence shape (FR-003). The Zod
`.strip()` default on the imported schema guarantees a stray `secret` key never survives (VII / FR-009).

---

## Entities

### Gate

| Field | Type | Notes |
|-------|------|-------|
| `id` | `"TG-G0" … "TG-G9"` | Stable id; selection key for `--gates`. |
| `name` | string | Human name (e.g. "Security/Tenant Isolation Gate"). |
| `purpose` | string | What risk it detects. |
| `run` | `(ctx: GateContext) => Finding[]` | Pure-ish function; reads only via `ctx`, returns findings. |

The **registry** holds all ten v0 gates keyed by id. Subset selection filters the registry by id
(unknown id → error, R7).

### GateContext (input to every gate)

| Field | Type | Source |
|-------|------|--------|
| `projectMap` | `ProjectMap` | Loaded + validated from `project-map.json` (002 `loadJson`+`validate`). |
| `repoRoot` | string | The scanned repo root (read-only). |
| `listFiles` | `(root) => string[]` | Reused from `@aker-build/scanner` io (read-only). |
| `fileExists` | `(root, rel) => boolean` | Reused from scanner io. |
| `readFileSafe` | `(root, rel) => string \| null` | Reused from scanner io. |
| `diff?` | (deferred) | PR/diff evidence for G2/G3/G8 matures with 007 (spec Assumptions). |

Gates are **read-only** on the scanned repo (FR-008): the context exposes only read primitives.

### Finding (discriminated union on `status`)

Always present: `gate_id` (string), `status` (enum). Status-conditional fields per R4:

| `status` | `severity` | `evidence` | Meaning |
|----------|-----------|-----------|---------|
| `risk` | `low`\|`medium`\|`high`\|`critical` | `≥1` Evidence Object | A risk was detected. |
| `needs_verification` | `null` | `≥1` Evidence Object | Insufficient evidence to assert pass/fail (FR-004). Evidence cites what was inspected / why inconclusive. |
| `not_applicable` | `null` | `≥0` (may be empty) | Gate does not apply to this repo (FR-005). |

Validation rules (enforced by the Zod discriminated union):
- A `risk` finding without evidence MUST NOT exist (FR-003).
- A `needs_verification` / `not_applicable` finding MUST have `severity: null` (FR-013).
- No finding-level `location`/`confidence` fields — those live *inside* the evidence object(s)
  (single canonical home; spec Finding entity).

### Severity

Ordered enum `low < medium < high < critical`. Applies only to `risk` findings; `null` otherwise.

### Risk List (`risks.json`)

| Field | Type | Notes |
|-------|------|-------|
| `schema_version` | number | Mirrors 002's `SCHEMA_VERSION` convention. |
| `findings` | `Finding[]` | Single unified array, all three statuses (no per-status top-level lists, FR-012). Stably sorted (R5). |

Written to `.aker-build/risks.json` (FR-014), outside the scanned repo's tracked source.

---

## v0 Gate Signal Set

Each gate is **signal-based** (heuristic), not exhaustive analysis. Each row lists example signals and
the evidence `type` a finding would cite. False negatives acceptable in v0; emitted findings must be
evidence-backed and low-false-positive (spec Assumptions).

| Gate | Example v0 signals | Evidence type(s) cited |
|------|--------------------|------------------------|
| **TG-G0** Source Truth | No source evidence read before a claim; missing spec/CI inputs | `missing_artifact`, `spec_file`, `ci_status` |
| **TG-G1** Architecture Boundary | Frontend importing backend internals; worker exposing HTTP routes; UI direct DB access | `file`, `line` |
| **TG-G2** Contract/API | Route changed without OpenAPI update; OpenAPI changed without client regen; response shape changed without tests | `changed_file`, `missing_artifact` |
| **TG-G3** Migration Safety | Destructive migration; dropped column/table; non-null column without default; no rollback note | `changed_file`, `file`, `missing_artifact` |
| **TG-G4** Security/Tenant Isolation | API route without auth guard; query without tenant filter; admin route without role guard; `tenant_id` missing from new table; secret printed in logs | `file`, `line` |
| **TG-G5** Idempotency | Webhook handler without signature/idempotency; job without idempotency key; payment action without replay protection | `file`, `line` |
| **TG-G6** Billing/Usage | Usage event without tenant/account id; plan-limit bypass; unmetered expensive op; pricing config changed without tests | `file`, `changed_file` |
| **TG-G7** Observability | Critical mutation without audit event; job without structured logs; integration without correlation id; missing retry/DLQ | `file`, `missing_artifact` |
| **TG-G8** Dependency/Upgrade | Lockfile changed unexpectedly; major upgrade without notes; CI version mismatch; runtime drift | `changed_file`, `missing_artifact` |
| **TG-G9** Release Readiness | Critical gates failing; CI failing; no rollback note for risky change; unresolved high-risk finding | `ci_status`, `failed_command`, `missing_artifact` |

**Diff-dependent gates** (G2/G3/G8) reach fuller coverage alongside 007-pr-reviewer; in v0 they emit
`needs_verification` when no diff evidence is available rather than asserting pass (FR-004).

**Secret handling** (all gates): secret-like content is emitted as a finding whose evidence `signal`
names the pattern (e.g. "aws_access_key_id-like string") — the secret value itself is **never** placed
in `path`, `signal`, or anywhere in the output (FR-009, SC-006).
