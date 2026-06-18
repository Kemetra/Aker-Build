# Feature Specification: CLI Scanner

**Feature Branch**: `003-cli-scanner`
**Created**: 2026-06-18
**Status**: Approved (foundation — reviewed 2026-06-18)
**Input**: User description: "Local repo scanning that produces project-map.json conforming to the 002 schema. Depends on 001 and 002. Docs only; no production code."

**Depends on**: `001-product-foundation`, `002-project-map-schema`
**Blocks**: `004-saas-gates-v0` (gates read the produced map), `005-derived-queue-router`

---

## Purpose *(mandatory)*

The CLI Scanner is the first capability that turns a real repository into evidence. It reads a local
repo (read-only) and produces a `project-map.json` that conforms to the `002-project-map-schema`
contract. It is the producer half of the 002↔003 pair: 002 defines the shape, 003 fills it from
source evidence.

This spec defines the scanner's **behavior and guarantees** (what it reads, what it never writes, how
it records evidence and uncertainty), not its parsing internals or language.

---

## User Scenarios & Testing *(mandatory)*

"User" is a developer running the scanner against a SaaS repo via the CLI.

### User Story 1 - Scan a repo into a conforming map (Priority: P1)

A developer runs the scan command against a local repo and gets a `project-map.json` that validates
against the 002 schema, describing detected stack, repos/areas, and (where detectable) tenant model
and critical surfaces.

**Why this priority**: This is the core deliverable — the first time TenantGuard produces source
truth. Everything downstream (gates, queue, router) reads this output.

**Independent Test**: Run the scan against a sample multi-tenant repo and validate the emitted
`project-map.json` against the 002 schema; confirm it passes and contains the detected structure.

**Acceptance Scenarios**:

1. **Given** a local SaaS repo, **When** the developer runs the scan, **Then** a `project-map.json`
   is produced that validates against the 002 schema.
2. **Given** the scan runs, **When** it completes, **Then** no file in the target repo has been
   created, modified, or deleted (read-only guarantee).
3. **Given** a detected value, **When** the map is inspected, **Then** the value is traceable to
   evidence (the file or signal it was derived from).

### User Story 2 - Scan an empty or unfamiliar repo safely (Priority: P2)

A developer scans a repo with no recognizable SaaS structure (or an unknown stack) and gets a valid,
honest map with empty/low-confidence sections rather than an error or fabricated data.

**Why this priority**: Robustness and honesty are core principles. The scanner must degrade
gracefully, never invent structure.

**Independent Test**: Scan an empty directory and a non-SaaS repo; confirm each yields a
schema-valid map with empty collections and an explicit "insufficient evidence" signal.

**Acceptance Scenarios**:

1. **Given** an empty or non-SaaS repo, **When** scanned, **Then** the map is schema-valid with empty
   collections and no fabricated stack/boundaries.
2. **Given** an undetectable stack, **When** scanned, **Then** stack fields are present but empty/null
   and marked low-confidence, not guessed.

### User Story 3 - Re-scan and get stable, comparable output (Priority: P3)

A developer re-scans an unchanged repo and gets a deterministic, equivalent map suitable for diffing
across runs.

**Why this priority**: Determinism makes the map trustworthy as source truth and enables change
detection over time.

**Independent Test**: Scan the same unchanged repo twice and confirm the two maps are equivalent
(stable ordering, no spurious differences).

---

### Edge Cases

- **Not a Git repo**: scanning a non-Git directory is reported clearly (out of MVP scope) rather than
  producing a misleading map.
- **Very large repo**: the scan completes or reports progress; it does not hang silently.
- **Unreadable / permission-denied paths**: skipped with a recorded note, not a crash.
- **Secret-like content encountered**: never copied into the map; flagged as a finding signal.
- **Symlinks / nested repos / monorepo**: represented as multiple repos/areas per the 002 schema.
- **Conflicting signals**: recorded as low-confidence rather than asserted.

---

## Requirements *(mandatory)*

### Functional Requirements

**Core behavior**

- **FR-001**: The scanner MUST read a local repository and produce a `project-map.json`.
- **FR-002**: The produced map MUST validate against the `002-project-map-schema` contract.
- **FR-003**: The scanner MUST be strictly read-only on the target repo — it MUST NOT create, modify,
  or delete any file in the repository being scanned. (Writing the output map to a designated output
  location is not a modification of the scanned repo.)
- **FR-004**: Every populated map value MUST be derived from observed evidence; the scanner MUST NOT
  fabricate stack, repos, boundaries, tenant model, or surfaces.

**Detection scope (MVP)**

- **FR-005**: The scanner MUST detect basic project structure: runtime/package-manager signals,
  repos/areas and their paths, and obvious frameworks where signals exist.
- **FR-006**: Where a value cannot be confidently detected, the scanner MUST emit it as empty/null
  and mark it low-confidence/unverified rather than guessing.
- **FR-007**: The scanner MUST represent single-repo and multi-repo/monorepo layouts.

**Honesty & robustness**

- **FR-008**: Scanning an empty or non-SaaS repo MUST yield a schema-valid map with empty collections
  and an explicit insufficient-evidence signal.
- **FR-009**: Unreadable paths MUST be skipped with a recorded note; the scan MUST NOT crash on them.
- **FR-010**: Re-scanning an unchanged repo MUST produce an equivalent, deterministic map (stable
  ordering) suitable for diffing.

**Safety & local-first**

- **FR-011**: The scanner MUST run with no network access and no credentials.
- **FR-012**: The scanner MUST NOT store, print, or embed secrets in the map or any output; secret-like
  content MUST be flagged, never copied.
- **FR-013**: The scanner MUST be domain-neutral — no Retail Tower, ERPNext, or POS-specific logic.

### Key Entities

- **Scan Run**: one invocation against a target repo path, producing one map (+ run notes).
- **Detection Signal**: an observed piece of evidence (a file, a config marker) that justifies a map
  value.
- **Run Note**: a recorded skip/warning (unreadable path, insufficient evidence, flagged secret).
- **Project Map** (from 002): the output artifact this feature produces.

---

## CLI Surface *(mandatory)*

The scanner is exposed through the MVP CLI (names are product surface; behavior is binding):

```text
tenantguard scan        scan the current/target repo and produce the project map
tenantguard map         show / re-emit the produced project map
```

The scan command operates on a target repo path (defaulting to the current directory) and writes its
output to a designated, predictable location without touching the scanned repo's tracked files.

---

## Required Outputs *(mandatory)*

```text
project-map.json   conforming to 002-project-map-schema
run notes          skips, warnings, insufficient-evidence and flagged-secret signals
                   (surfaced in the map's evidence annotations and/or a run summary)
```

---

## Non-Goals *(mandatory)*

```text
- Running gate checks over the map (that is 004-saas-gates-v0).
- Deriving a queue or routing (005).
- Compiling agent prompts (006).
- PR / diff review (007).
- Deep, framework-exhaustive detection for every language (MVP detects basic structure only).
- Modifying the scanned repo in any way.
- Network calls, GitHub API access, or credential use.
- Choosing a specific parsing/AST library or language (decided at plan layer).
- Retail Tower / ERPNext / POS-specific detection rules.
```

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Scanning a sample multi-tenant repo produces a `project-map.json` that validates against
  the 002 schema with zero errors.
- **SC-002**: After any scan, 100% of the scanned repo's files are unchanged (read-only verified).
- **SC-003**: 100% of populated map values trace to at least one detection signal; 0 fabricated values.
- **SC-004**: Scanning an empty/non-SaaS repo yields a schema-valid map (no crash, no fabricated data).
- **SC-005**: Two scans of an unchanged repo produce equivalent maps (no spurious diffs).
- **SC-006**: 0 secrets appear in any produced map or output.
- **SC-007**: The scan completes with no network access and no credentials configured.

---

## Acceptance Criteria for This Feature *(mandatory)*

- **AC-001**: Scanner behavior, read-only guarantee, and evidence-derivation rule are specified.
- **AC-002**: Output conformance to the 002 schema is a stated, testable requirement.
- **AC-003**: Graceful degradation (empty/unknown/unreadable) is specified.
- **AC-004**: Determinism / re-scan stability is specified.
- **AC-005**: Local-first, no-network, no-secrets guarantees are specified.
- **AC-006**: CLI surface (`scan`, `map`) and required outputs are defined.
- **AC-007**: Non-goals are explicit (gates, queue, prompts, review, deep detection, library choice).
- **AC-008**: The spec is implementation-neutral on language/parsing library (deferred to plan).
- **AC-009**: No production code, scanner code, `package.json`, or lockfile is created.

---

## Assumptions

- **Language / parsing approach deferred** to the plan/ADR layer. The blueprint proposes a
  TypeScript/Node CLI; this spec mandates *behavior*, not the stack or parsing library.
- **Target repos are Git repositories**; non-Git directories are reported as out of MVP scope.
- **Detection is heuristic for MVP**: "basic structure" means high-signal markers (manifest files,
  directory conventions), not exhaustive static analysis — full analysis is an explicit non-goal.
- **Output location** is a predictable path outside the scanned repo's tracked source; exact path
  conventions are settled at the plan layer.
- **The 002 schema is the authority** for output shape; any tension between scanner convenience and
  the schema is resolved in favor of the schema.
- **Tenant-model / boundary detection** in MVP may often be low-confidence or empty; that is
  acceptable and honest, not a failure.
