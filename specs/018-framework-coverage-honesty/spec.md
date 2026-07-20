# Feature Specification: Framework Coverage Honesty

**Feature Branch**: `018-framework-coverage-honesty`  
**Created**: 2026-07-20  
**Status**: Implemented
**Input**: Continue the recommended fortification work after Specs 016–017. Close W3b's known blind spots without adding an AST parser or overstating coverage.

## Problem

Aker Build's scanner recognizes common Express-shaped routes and receiver-gated JavaScript database calls, but it can miss model-first ORM calls and framework-native route/auth patterns. A clean result currently does not state which recognizers actually matched the target repository. That can turn limited coverage into false confidence.

The next safe improvement is to deepen recognition with small, deterministic signature packs and publish exact coverage evidence. The product must say what it recognized, never imply complete framework or repository coverage.

## User Scenarios & Testing

### User Story 1 — See what Aker Build actually covered (Priority: P1)

After a scan or `check`, a developer can see which signature packs matched and which detector capabilities each pack supports.

**Independent Test**: Scan one repository with recognized framework markers and one without them. The first map/report lists deterministic pack and capability evidence; the second explicitly warns that no framework signature pack matched.

**Acceptance Scenarios**:

1. **Given** a repository containing NestJS routes and Prisma queries, **When** it is scanned, **Then** `project-map.json` lists `nestjs` for routes/auth and `prisma` for data access.
2. **Given** a repository with no recognized signatures, **When** its report is rendered, **Then** the report says that no framework signature pack matched and that a clean finding set does not establish coverage.
3. **Given** a repository with matched packs but no findings, **When** its report is rendered, **Then** the report names the matched capabilities and states that signature recognition is not proof of complete coverage.

---

### User Story 2 — Detect framework-native risk evidence (Priority: P1)

A developer using model-first Mongoose, NestJS, Next.js App Router, Fastify, Django, or SQLAlchemy gets deterministic evidence for supported route, auth, and data-access patterns.

**Independent Test**: Fixture tests exercise each supported signature. Positive risk fixtures produce the expected evidence/finding and guarded or tenant-scoped variants remain clean.

**Acceptance Scenarios**:

1. **Given** `User.findOne({ active: true })` in a Mongoose-marked file, **When** the repository is scanned and gated, **Then** it emits one medium-confidence `no_tenant_filter` datum and one suspected G4 risk.
2. **Given** a NestJS `@Get("admin")` route without `@UseGuards` or a role guard, **When** gates run, **Then** G4 attributes auth and role findings to the decorator line.
3. **Given** the same NestJS route with nearby `@UseGuards` and `@Roles`, **When** gates run, **Then** those route findings are absent.
4. **Given** a Next.js `app/**/route.ts` handler, Django ORM call, or SQLAlchemy query, **When** it is scanned, **Then** the matching route or data-access evidence is emitted without source mutation.

---

### User Story 3 — Preserve contracts and trust boundaries (Priority: P2)

Existing v1 Project Maps remain readable, outputs stay deterministic and secret-safe, and legacy maps still use the established G4 fallback.

**Independent Test**: Validate an old v1 map, a new v2 map, shuffled input files, and a legacy map without route/auth evidence. Results remain valid, sorted, and behavior-compatible.

## Required Signature Packs

| Pack ID | Recognized capability |
|---|---|
| `express` | routes, auth |
| `fastify` | routes, auth |
| `nextjs-app-router` | routes |
| `nestjs` | routes, auth |
| `prisma` | data access |
| `mongoose` | data access |
| `django` | routes, auth, data access |
| `sqlalchemy` | data access |
| `generic-js-db` | data access for the existing receiver-gated families |
| `raw-sql` | data access |

## Functional Requirements

- **FR-001**: Framework recognition MUST be implemented as small declarative signature packs consumed by scanner detectors; it MUST NOT introduce an AST/parser dependency.
- **FR-002**: Matching MUST be read-only, deterministic, offline, and restricted to the existing supported source-file extensions.
- **FR-003**: The scanner MUST emit `project-map.coverage` with `source_files_examined` and sorted pack records containing `id`, sorted `capabilities`, and `matched_files`.
- **FR-004**: Coverage pack records MUST describe only recognizers that matched at least one file; they MUST NOT claim whole-file, whole-framework, or semantic completeness.
- **FR-005**: An empty `packs` array MUST be treated as honest lack of recognized coverage, not as successful full coverage.
- **FR-006**: Project Map schema output MUST advance additively to v2; v1 maps without `coverage` MUST remain valid.
- **FR-007**: The JSON Schema interop contract and Project Map package documentation MUST describe the v2 additive field and compatibility behavior.
- **FR-008**: The report contract MUST expose a nullable coverage summary and render a dedicated Markdown coverage section.
- **FR-009**: Reports with no coverage evidence MUST explicitly say that a clean finding set does not establish framework coverage.
- **FR-010**: Reports with coverage evidence MUST list pack/capability matches and state that signature recognition is not proof of complete coverage.
- **FR-011**: Data-access detection MUST preserve the existing receiver-gated and raw-SQL behavior while adding Prisma, Mongoose, Django ORM, and SQLAlchemy signatures without duplicate evidence for a single query site.
- **FR-012**: Multi-line tenant-token classification MUST preserve the existing five-line bounded window and confidence semantics.
- **FR-013**: Route detection MUST add Next.js App Router, NestJS, Fastify, and Django route signatures while preserving Express behavior.
- **FR-014**: Auth detection MUST add NestJS, Fastify, and Django guard signatures while preserving the existing generic auth/role tokens.
- **FR-015**: G4 MUST consume scanner route/auth evidence when those fields are present and MUST retain a deduplicated live source-scan fallback for older maps and route locations added after the map was produced.
- **FR-016**: G4 route/guard correlation MUST recognize inline or nearby guards, downgrade ambiguous file-level middleware to suspected evidence, and keep unguarded routes confirmed only when no relevant guard exists in the file.
- **FR-017**: New positive and clean benchmark fixtures MUST pin Mongoose data-access and NestJS route/auth behavior without lowering existing thresholds.
- **FR-018**: No output may contain source text, secret values, credentials, or any mutation instruction.

## Edge Cases

- A file matches more than one pack: every matched pack is reported, while a query/route line emits at most one evidence record per signal.
- A decorator guard is one or two lines above a route decorator: it counts as nearby; a distant guard only lowers confidence.
- A Next.js function named `GET` outside an App Router `route.*` file: it is not treated as a route.
- A capitalized JavaScript class exposes `findOne` without Mongoose markers: it is not classified as Mongoose solely from capitalization.
- A v1 map omits `routes`, `auth`, and `coverage`: validation succeeds and G4 uses its legacy fallback.
- A route is added after a v2 map was produced: G4 live-detects the unmapped route without duplicating mapped route findings.
- Unreadable files are skipped using the existing scanner behavior and never reported as covered.

## Success Criteria

- **SC-001**: All required signature packs have direct positive and negative unit coverage.
- **SC-002**: New Mongoose and NestJS benchmark cases execute through the real `scan → gates` pipeline with zero unexpected false positives or false negatives.
- **SC-003**: Existing 15 benchmark cases and every configured threshold remain green.
- **SC-004**: New scans emit valid v2 Project Maps; existing v1 fixtures still validate unchanged.
- **SC-005**: A no-pack report contains the explicit coverage warning; a matched-pack report lists deterministic IDs/capabilities.
- **SC-006**: Full tests, typecheck, namespace check, packed CLI smoke, benchmark, and first-run smoke pass.

## Non-Goals

- AST parsing, whole-program data flow, or claims of semantic completeness.
- Hosted dashboards, org aggregation, blocking enforcement, or public release operations.
- Agent execution, auto-fix, source mutation, commit, push, or merge behavior in the product.
- Framework-specific business rules, Retail Tower logic, or ERPNext logic.
