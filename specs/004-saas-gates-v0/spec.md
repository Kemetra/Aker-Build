# Feature Specification: SaaS Gates v0

**Feature Branch**: `004-saas-gates-v0`
**Created**: 2026-06-18
**Status**: Draft
**Input**: User description: "Implement initial SaaS gate checks with evidence-based findings. Depends on 001, 002, 003. Docs only; no production code."

**Depends on**: `001-product-foundation`, `002-project-map-schema`, `003-cli-scanner`
**Blocks**: `005-derived-queue-router` (router consumes gate findings), `007-pr-reviewer` (review runs gates)

---

## Purpose *(mandatory)*

SaaS Gates v0 are TenantGuard's risk-detection layer. They read the Project Map (002) and the repo's
current evidence and produce a `risks.json` — a list of evidence-backed findings tied to named gates
(TG-G0…TG-G9). Gates are the same checks TenantGuard applies to user projects and to its own PRs.

This spec defines the **gate model and the v0 check set** (what each gate looks for, what evidence it
must cite, how findings are shaped), not the parsing internals or rule-engine library.

---

## Clarifications

### Session 2026-06-18

- Q: How should `risks.json` represent the three gate outcomes (risk / needs-verification / not-applicable)? → A: One unified `findings[]` array; each finding carries a `status` enum (`risk` / `needs_verification` / `not_applicable`); severity + evidence are required for `risk` findings and conditional for the other statuses (see FR-013 / Finding entity).
- Q: How is a subset of gates selected on the CLI (FR-006)? → A: By gate id, comma-separated — e.g. `tenantguard gates --gates TG-G4,TG-G5`.
- Q: What are the canonical severity labels? → A: `low` / `medium` / `high` / `critical` (ordered, low→critical).
- Q: What defines the v0 "sample set" for the false-positive baseline (SC-003)? → A: Reuse and extend the 003 scanner test fixtures (`saas`, `monorepo`, `empty`) with per-gate clean/violation fixtures; no new test infrastructure.
- Q: Where is `risks.json` written? → A: To the designated output dir (`.tenantguard/risks.json`), the same out-dir convention 003 uses for `project-map.json`.

---

## User Scenarios & Testing *(mandatory)*

"User" is a developer/team running gates over a scanned repo.

### User Story 1 - Get an evidence-backed risk list (Priority: P1)

A developer runs the gates over a scanned repo and gets `risks.json` where every finding names a gate
and a status, and every `risk` finding additionally names a severity and concrete evidence.

**Why this priority**: Risk findings are the raw material for routing, prompts, and PR review. Without
evidence-backed findings, the rest of the product has nothing trustworthy to act on.

**Independent Test**: Run gates over a repo with a known violation (e.g. an API route without an auth
guard) and confirm a finding appears, tied to the right gate, with evidence pointing at the file.

**Acceptance Scenarios**:

1. **Given** a scanned repo, **When** gates run, **Then** a `risks.json` is produced.
2. **Given** any finding, **When** inspected, **Then** it cites a gate id and a status; and **Given** a
   `status: risk` finding, **Then** it additionally cites a severity and at least one piece of concrete
   evidence (file/line/changed-file/missing-artifact/failed-command).
3. **Given** a clean repo for a given gate, **When** that gate runs, **Then** it produces no
   false-positive finding for that gate.

### User Story 2 - Understand and prioritize risks (Priority: P2)

A team lead reviews `risks.json` and can tell, per finding, which gate it belongs to and its status; and
for each `risk` finding, how severe it is and where to look.

**Why this priority**: Findings must be actionable; severity + location is what makes triage possible.

**Independent Test**: Produce a risk list spanning several gates and confirm each finding is
classifiable by gate and status — and each `risk` finding by severity — without reading code.

### User Story 3 - Run a subset of gates (Priority: P3)

A developer runs only the gates relevant to a change (e.g. security + idempotency) by passing their
gate ids — `tenantguard gates --gates TG-G4,TG-G5` — and gets just those findings.

**Why this priority**: Targeted runs keep feedback fast and relevant, especially for PR review (007).

---

### Edge Cases

- **Insufficient evidence for a gate**: the gate reports "needs verification" rather than asserting
  pass or fail.
- **Gate not applicable** (e.g. no billing surface): the gate is skipped/marked not-applicable, not
  failed.
- **Empty / non-SaaS repo**: zero `risk` findings (no fabrication). The list is "minimal," not
  necessarily empty: each gate that does not apply MAY emit a single `not_applicable` finding
  (at most one per gate), and a gate lacking evidence MAY emit one `needs_verification` finding —
  these honest absence/uncertainty markers are not fabricated risks.
- **Conflicting evidence**: finding is emitted at lower confidence rather than as a hard assertion.
- **Secret-like content found by a gate**: flagged as a finding; the secret value itself is never
  copied into the risk list.

---

## Gate Model *(mandatory)*

Each gate has: a stable **id** (TG-Gn), a **name**, a **purpose** (what risk it detects), the
**evidence** it relies on, and **example signals** it looks for. v0 gates:

### TG-G0 — Source Truth Gate
No routing, prompt, or readiness claim before source evidence is read. Evidence: repo files,
`git status`, local diff, PR metadata, CI status, spec files.

### TG-G1 — Architecture Boundary Gate
Detects boundary violations. Signals: frontend importing backend internals; worker exposing public
HTTP routes; direct DB access from UI; an integration adapter bypassing the API boundary.

### TG-G2 — Contract/API Gate
Detects API contract drift. Signals: route changed without OpenAPI update; OpenAPI changed without
generated-client update; public response shape changed without tests.

### TG-G3 — Migration Safety Gate
Detects risky DB changes. Signals: destructive migration; dropped column/table; non-null column
without default; migration without rollback note; migration without test/seed consideration.

### TG-G4 — Security/Tenant Isolation Gate
Detects missing/risky tenant boundaries. Signals: API route without auth guard; query without tenant
filter; admin route without role guard; `tenant_id` missing from a new table; secrets printed in logs.

### TG-G5 — Idempotency Gate
Detects mutation flows that can duplicate work. Signals: webhook handler without
signature/idempotency tracking; background job without idempotency key; payment action without replay
protection; external posting call without dedupe key.

### TG-G6 — Billing/Usage Gate
Detects billing-sensitive issues. Signals: usage event without tenant/account id; plan-limit bypass;
unmetered expensive operation; pricing config changed without tests.

### TG-G7 — Observability Gate
Detects missing operational signals. Signals: critical mutation without audit event; job without
structured logs; external integration without correlation id; missing retry/dead-letter path.

### TG-G8 — Dependency/Upgrade Gate
Detects dependency risks. Signals: lockfile changed unexpectedly; major upgrade without notes; CI
version mismatch; runtime version drift.

### TG-G9 — Release Readiness Gate
Detects release blockers. Signals: critical gates failing; CI failing; no rollback note for a risky
change; unresolved high-risk review finding.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST define the v0 gate set (TG-G0…TG-G9), each with id, name, purpose, and
  the evidence it relies on.
- **FR-002**: Running gates over a scanned repo MUST produce a `risks.json` list of findings.
- **FR-003**: Every finding MUST cite a `gate_id` and a `status`. A finding with `status: risk` MUST
  additionally cite a severity and at least one **Evidence Object** using the shared
  `{type, path, line, signal, confidence}` shape from `002-project-map-schema`; a `risk` finding
  without evidence MUST NOT be emitted. Gates MUST reuse the shared evidence shape and MUST NOT define
  a divergent evidence/finding shape. (Severity/evidence requirements for non-`risk` statuses are
  defined in FR-013 and the Finding entity.)
- **FR-004**: A gate with insufficient evidence MUST emit a finding with `status: needs_verification`,
  never a fabricated pass/fail.
- **FR-005**: A gate that does not apply to a repo MUST emit a finding with `status: not_applicable`,
  not a failure.
- **FR-006**: The system MUST support running a subset of gates, selected by gate id via a
  comma-separated `--gates` option (e.g. `--gates TG-G4,TG-G5`).
- **FR-012**: Findings MUST use a single unified `findings[]` array; each finding carries a `status`
  enum (`risk` / `needs_verification` / `not_applicable`). Outcomes MUST NOT be split into separate
  top-level lists.
- **FR-013**: For a `status: risk` finding, severity MUST be one of the ordered labels
  `low` / `medium` / `high` / `critical`. For `status: needs_verification` or `not_applicable`,
  severity MUST be `null` (no risk has been asserted). A `needs_verification` finding MUST still cite
  at least one Evidence Object (what was inspected / why evidence was insufficient); a `not_applicable`
  finding MAY have an empty evidence list (the gate simply does not apply).
- **FR-014**: `risks.json` MUST be written to the designated output directory (`.tenantguard/`), the
  same out-dir convention `003-cli-scanner` uses for `project-map.json`; writing there is not a
  modification of the scanned repo's tracked source.
- **FR-007**: Gate runs MUST be deterministic for unchanged input (stable findings and ordering).
- **FR-008**: Gates MUST read the Project Map (002) and repo evidence; they MUST be read-only on the
  scanned repo.
- **FR-009**: Findings MUST NOT contain secrets; secret-like content MUST be flagged, never copied.
- **FR-010**: Gates MUST run with no network access and no credentials (local-first).
- **FR-011**: Gates MUST be domain-neutral — generalized SaaS rules, no Retail Tower/ERPNext/POS
  specifics.

### Key Entities

- **Gate**: a named check (id, name, purpose, evidence basis).
- **Finding**: one gate outcome. Always: `gate_id`, `status` (`risk` / `needs_verification` /
  `not_applicable`). Conditional on status:
  - `risk` → `severity` (`low`/`medium`/`high`/`critical`) + ≥1 **Evidence Object**.
  - `needs_verification` → `severity: null` + ≥1 **Evidence Object** (what was inspected / why
    inconclusive).
  - `not_applicable` → `severity: null` + evidence list MAY be empty.
  Evidence Objects use the shared `{type, path, line, signal, confidence}` shape defined in
  `002-project-map-schema`. Location and confidence live *inside* the evidence object(s) — they are not
  separate finding-level fields — so there is a single canonical home for each.
- **Risk List** (`risks.json`): a single unified `findings[]` collection from a gate run, holding all
  three outcome statuses (no separate per-status top-level lists).
- **Severity**: one of the ordered labels `low` / `medium` / `high` / `critical` (low→critical),
  supporting triage.

---

## CLI Surface *(mandatory)*

```text
tenantguard gates                       run the full gate set over the scanned repo, produce risks.json
tenantguard gates --gates TG-G4,TG-G5   run only the named gates (comma-separated gate ids)
```

---

## Required Outputs *(mandatory)*

```text
.tenantguard/risks.json
             A single unified findings[] array. Every finding = gate id + status
             (risk / needs_verification / not_applicable). A risk finding additionally has
             severity (low/medium/high/critical) + one or more shared Evidence Objects
             ({type, path, line, signal, confidence}) per 002; needs_verification has
             severity:null + >=1 evidence; not_applicable has severity:null + possibly-empty
             evidence. Location and confidence are carried inside the evidence object(s), not as
             separate finding fields. Written to the designated out-dir (same convention as 003's
             project-map.json), never into the scanned repo's tracked source.
```

---

## Non-Goals *(mandatory)*

```text
- Auto-fixing any finding.
- Deriving a queue or routing from findings (that is 005).
- Compiling prompts (006) or reviewing PRs (007).
- A full static-analysis / data-flow engine — v0 is signal-based, evidence-first detection.
- An OPA/Rego policy engine (deferred).
- Choosing a rule-engine library or language (decided at plan layer).
- Retail Tower / ERPNext / POS-specific gate rules.
```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Running gates over a repo with a known violation produces a finding tied to the correct
  gate with evidence pointing at the offending location.
- **SC-002**: 100% of emitted findings cite a gate id and a status; 100% of `status: risk` findings
  additionally cite a severity and at least one evidence item.
- **SC-003**: A repo clean for a gate produces 0 false-positive findings for that gate (on the v0
  sample set). The **v0 sample set** = the reused 003 scanner fixtures (`saas`, `monorepo`, `empty`)
  plus per-gate clean/violation fixtures added for the gates under test; no new test infrastructure.
- **SC-004**: A gate with insufficient evidence reports "needs verification" rather than pass/fail.
- **SC-005**: Two gate runs over unchanged input produce equivalent risk lists (deterministic).
- **SC-006**: 0 secrets appear in any risk list.
- **SC-007**: Gates run with no network access and no credentials.

---

## Acceptance Criteria for This Feature *(mandatory)*

- **AC-001**: The v0 gate set (TG-G0…TG-G9) is defined with id, name, purpose, and evidence basis.
- **AC-002**: Finding shape is specified as gate id + `status` (`risk` / `needs_verification` /
  `not_applicable`), with severity (`low`/`medium`/`high`/`critical`) and ≥1 shared Evidence Object
  (`{type, path, line, signal, confidence}` from 002) required for `risk` findings and conditional for
  the other statuses (severity `null`; evidence required for `needs_verification`, optional for
  `not_applicable`), in a single unified `findings[]` array; location and confidence are inside the
  evidence object, and 004 reuses the shared shape rather than redefining it.
- **AC-003**: "Needs verification" and "not applicable" behaviors are specified.
- **AC-004**: Subset execution and determinism are specified.
- **AC-005**: Read-only, local-first, no-secrets, domain-neutral guarantees are specified.
- **AC-006**: CLI surface (`gates`) and required output (`risks.json`) are defined.
- **AC-007**: Non-goals are explicit (auto-fix, queue, prompts, review, full SA, OPA, library choice).
- **AC-008**: The spec is implementation-neutral on the rule engine (deferred to plan).
- **AC-009**: No production code, gate code, `package.json`, or lockfile is created.

---

## Assumptions

- **Rule-engine approach deferred** to plan/ADR. The blueprint proposes TypeScript rules + YAML config
  for v0, with OPA/Rego deferred; this spec mandates the gate *model and behavior*, not the engine.
- **Severity scale** is the ordered set `low` / `medium` / `high` / `critical` (clarified 2026-06-18;
  see Clarifications).
- **v0 detection is signal-based**, not exhaustive static analysis — false negatives are acceptable in
  v0 as long as findings that ARE emitted are evidence-backed and low on false positives.
- **Gate vocabulary** (surface names, boundary rule keys) aligns with the 002 schema and 003 scanner
  output; where they differ, the schema is authoritative.
- **PR/diff evidence** (for gates like TG-G2/G3/G8) is available when reviewing changes; full coverage
  of diff-only gates matures alongside 007-pr-reviewer.
