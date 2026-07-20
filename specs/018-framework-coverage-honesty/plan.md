# Implementation Plan: Framework Coverage Honesty

**Branch**: `018-framework-coverage-honesty`  
**Date**: 2026-07-20  
**Spec**: [spec.md](./spec.md)

## Summary

Add deterministic framework signature packs, emit additive Project Map v2 coverage evidence, route scanner evidence into G4, expose coverage in report v2, and pin the new behavior with unit, compatibility, benchmark, packaging, and full-system verification.

## Architecture

```text
signature packs
  ├─ routes detector ─┐
  ├─ auth detector ───┼─> project-map v2 evidence ─> G4 correlation
  ├─ data detector ───┤
  └─ coverage detector┘                         └─> report v2 coverage section
```

The scanner remains observation-only. Packs contain identifiers, capabilities, source extensions, framework markers, and line signatures. Detectors emit normalized Evidence objects. G4 alone decides whether correlated evidence is risky.

## Contract

New additive Project Map field:

```json
{
  "version": 2,
  "coverage": {
    "source_files_examined": 12,
    "packs": [
      { "id": "nestjs", "capabilities": ["auth", "routes"], "matched_files": 3 },
      { "id": "prisma", "capabilities": ["data_access"], "matched_files": 2 }
    ]
  }
}
```

Pack IDs and records are lexically sorted; capabilities use canonical lexical order. `coverage` remains optional in validation for v1 compatibility but is always emitted by the v2 scanner.

Report v2 copies this value to `summary.coverage`, or uses `null` for a legacy Project Map. Markdown renders either exact pack/capability evidence plus a limitation sentence, or an explicit no-recognized-pack warning.

## Work Sequence

1. Add failing Project Map v2 coverage schema/compatibility tests, then implement Zod + JSON Schema + docs.
2. Add failing signature-pack and coverage detector tests, then implement the shared declarative pack table.
3. Add failing route/auth/data-access detector tests, then consume packs with single-evidence-per-line deduplication.
4. Add failing G4 correlation tests, then prefer Project Map evidence with a legacy fallback.
5. Add failing report v2 tests, then expose and render coverage honesty.
6. Add Mongoose and NestJS positive/clean benchmark cases and verify unchanged thresholds.
7. Update README/status/source-truth documentation and Spec 018 evidence.
8. Run focused tests, full tests, typecheck, namespace, exact package smoke, benchmark, and first-run smoke.

## Verification

```powershell
pnpm --filter @aker-build/project-map test
pnpm --filter @aker-build/scanner test
pnpm --filter @aker-build/gates test
pnpm --filter @aker-build/report test
pnpm test
pnpm typecheck
pnpm test:cli-package
pnpm dlx tsx packages/eval/src/bin.ts
pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp
git diff --check
git status --short
```

## Risks and Controls

- **Duplicate evidence**: first-match/normalized-key deduplication and direct tests.
- **Regex false confidence**: packs report recognition only; findings retain confidence tiers; no completeness percentage.
- **Contract breakage**: optional v2 field, unchanged v1 fixtures, explicit JSON Schema update.
- **G4 regression**: legacy fallback tests plus the full existing corpus.
- **Package growth**: exact five-file tarball and zero-runtime-dependency checks remain release gates.

