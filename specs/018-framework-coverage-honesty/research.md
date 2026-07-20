# Research: Framework Coverage Honesty

## Decision 1 — Fortify coverage before expanding reach

**Decision**: Implement W3b coverage honesty before P5 org aggregation or P6 enforcement.

**Why**: Aggregating or enforcing a clean result is unsafe when the scanner cannot state what it recognized. This directly closes the remaining README limitation and follows the locked fortify-before-expand dependency chain.

**Alternatives rejected**:

- Org dashboard now: scales uncertain results.
- Blocking enforcement now: can block on unmeasured blind spots and is explicitly deferred.
- More packaging polish: Spec 017 already provides a verified zero-dependency artifact and protected release path.

## Decision 2 — Declarative regex packs, not AST parsers

**Decision**: Centralize named, capability-scoped regex signatures in one scanner module and let routes, auth, data-access, and coverage detection consume them.

**Why**: It extends the existing deterministic architecture, adds no runtime dependency, bundles cleanly, and keeps every heuristic auditable. Pack IDs make recognized scope visible.

**Alternative rejected**: Multi-language AST integration would be a broad architecture/dependency expansion and still would not by itself solve honest coverage reporting.

## Decision 3 — Evidence of recognition, not a coverage percentage

**Decision**: Emit `coverage.source_files_examined` and pack records `{id, capabilities, matched_files}`. Do not emit a percentage, `covered: true`, or unmatched-file list.

**Why**: A regex pack matching a file cannot prove semantic coverage of the file or framework. Counts and capabilities are factual; percentages would imply a denominator the scanner cannot establish.

## Decision 4 — Additive Project Map v2 and report v2

**Decision**: Advance new producer output to Project Map v2 with optional `coverage`, keeping v1 documents valid. Advance the generated report to schema v2 with a nullable coverage summary.

**Why**: The Project Map policy requires a version advance for optional fields. Nullable report coverage lets reports built from old maps remain honest rather than fabricate an empty coverage claim.

## Decision 5 — Scanner evidence becomes G4's primary route/auth input

**Decision**: G4 correlates `projectMap.routes` and `projectMap.auth` when both fields exist, using a bounded nearby-line check. It falls back to the current source scan only when those fields are absent.

**Why**: Signature packs otherwise improve Project Map evidence but not user-visible findings. Consuming the public evidence preserves the scanner/gate boundary: detectors observe; the gate judges. The legacy fallback keeps old maps useful.

## Decision 6 — Benchmark the highest-risk new paths

**Decision**: Add positive/clean Mongoose and NestJS cases to the real corpus; unit-test the remaining packs directly.

**Why**: Mongoose closes the named model-first tenant-isolation blind spot. NestJS proves route/auth evidence reaches G4. Four fixtures keep the statistical corpus focused while unit tests cover signature breadth.

