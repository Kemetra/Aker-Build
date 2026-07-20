# Tasks: Framework Coverage Honesty

- [x] T001 Add Project Map v2 coverage schema tests and preserve v1 compatibility.
- [x] T002 Implement the coverage contract, JSON Schema sync, and version-policy docs.
- [x] T003 Add signature-pack and coverage-detector tests.
- [x] T004 Implement the declarative signature packs and deterministic coverage detector.
- [x] T005 Add route/auth/data-access pack behavior and deduplication tests.
- [x] T006 Implement pack-backed scanner evidence for all required signatures.
- [x] T007 Add G4 evidence-correlation and legacy-fallback tests.
- [x] T008 Make G4 consume route/auth evidence without changing secret-log behavior.
- [x] T009 Add report v2 matched/no-match/legacy coverage tests.
- [x] T010 Implement report JSON and Markdown coverage honesty.
- [x] T011 Add Mongoose and NestJS positive/clean benchmark cases.
- [x] T012 Update README, roadmap status, and active feature source truth.
- [x] T013 Run focused and full verification; record exact evidence below.

## Verification Evidence

- `pnpm test` — passed across all workspace packages; namespace suite passed; 3 credential-gated live GitHub tests skipped as designed.
- `pnpm typecheck` — passed across all 13 non-root workspace packages.
- `pnpm test:cli-package` — 21/21 package-contract tests passed; exact five-file zero-dependency tarball clean-installed as `aker-build@0.1.0` and smoked successfully.
- `pnpm dlx tsx packages/eval/src/bin.ts` — all 19 cases executed; every threshold passed; measured TG-G3/G4 tiers and TG-G5 suspected remained at 100% precision/recall where defined.
- `pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp` — full documented CLI chain passed, post-scan G4 route findings remained visible, and the exact temp directory was removed.
- `git diff --check` — passed before commit.
