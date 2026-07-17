# P3 Prove It — Eval Harness + Benchmark — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **BRANCH PRECONDITION:** Implement on a branch off `main` AFTER P2 (PR #22) merges — P3 depends on P2's `confidenceTier`. Do NOT implement on `worktree-p2-calibrate`.

**Goal:** Prove detection quality with a labeled benchmark corpus + an eval harness that measures precision/recall per confidence tier and gates the tool's own quality via thresholds.

**Architecture:** A `benchmark/` corpus of synthetic, gate-scoped cases (repo + `expected.json`) and a `packages/eval` runner that runs the real `scan → gates` pipeline over each case, diffs gate-scoped findings against expected by `(gate_id, path, tier)`, and emits a versioned scorecard. Read-only over public package surfaces only.

**Tech Stack:** TypeScript (ESM), Vitest, pnpm. Reuses `scanToFile`/`runGatesToFile`/`confidenceTier`/`findingId` from `@aker-build/{scanner,gates}`.

## Global Constraints

- **Gate-scoped metric (the core correctness rule):** count ONLY findings whose `gate_id ∈ case.gates_under_test`. All other findings (baseline G0/G2/G8/G9 noise, `needs_verification`, `not_applicable`) are ignored — never false positives. (Verified: `clean` fixture fires 6 non-tested findings, `vuln` fires 10 — none may be penalized.)
- **Match key = `(gate_id, path, tier)`** — never signal strings (descriptions, not IDs). `path` = `evidence[0].path`; `tier` = `confidenceTier(finding)`; lines excluded (drift).
- **Public surfaces only** — the harness imports `scanToFile`, `runGatesToFile`, `confidenceTier`; never gate/detector internals.
- **Synthetic corpus only** — no Retail Tower / ERPNext logic (constitution).
- The scorecard is a NEW versioned artifact (`schema_version`); no existing `SCHEMA_VERSION` bumps.
- ESM `.js` specifiers; never `git add -A`/`.`; verify with `pnpm test` + `pnpm typecheck`.

---

### Task 1: Corpus loader + types

**Files:**
- Create: `packages/eval/src/types.ts`, `packages/eval/src/corpus.ts`
- Create: `benchmark/cases/unprotected-admin-route/` (repo + `expected.json`), `benchmark/cases/clean-guarded/` (`expected_findings: []`)
- Test: `packages/eval/tests/corpus.test.ts`

**Interfaces:**
- Produces: `ExpectedFinding = { gate_id: string; path: string; tier: "confirmed" | "suspected" }`;
  `Case = { name: string; dir: string; description: string; gates_under_test: string[]; expected_findings: ExpectedFinding[] }`;
  `loadCases(corpusDir: string): Case[]` (sorted by name; validates each `expected.json`).

- [ ] **Step 1: Write the failing test** — `loadCases` returns the two seed cases, each with parsed `gates_under_test` + `expected_findings`; throws a clear error on a case missing `gates_under_test`.
- [ ] **Step 2: Run → fail** (`pnpm --filter @aker-build/eval exec vitest run tests/corpus.test.ts`).
- [ ] **Step 3: Create the two seed cases.** `unprotected-admin-route/`: a minimal repo (`package.json` + `apps/api/admin.ts` with `app.get("/admin/x", handler)` and no guard token anywhere) + `expected.json` `{ gates_under_test: ["TG-G4"], expected_findings: [{ gate_id: "TG-G4", path: "apps/api/admin.ts", tier: "confirmed" }] }`. `clean-guarded/`: same route WITH `requireRole` on the line + `expected_findings: []`, `gates_under_test: ["TG-G4"]`.
- [ ] **Step 4: Implement `types.ts` + `corpus.ts`** (read dirs under `corpusDir`, parse+validate `expected.json`, sort by name).
- [ ] **Step 5: Run → pass. Commit.**

---

### Task 2: Case runner — run the real pipeline, collect gate-scoped findings

**Files:**
- Create: `packages/eval/src/run-case.ts`
- Test: `packages/eval/tests/run-case.test.ts`

**Interfaces:**
- Consumes: `Case` (Task 1); `scanToFile`, `runGatesToFile` from `@aker-build/scanner`/`gates`; `confidenceTier`.
- Produces: `runCase(c: Case): ActualFinding[]` where `ActualFinding = { gate_id: string; path: string; tier: "confirmed" | "suspected" }` — ONLY for findings whose `gate_id ∈ c.gates_under_test` and `status === "risk"` (needs_verification/not_applicable excluded).

- [ ] **Step 1: Write the failing test** — `runCase(unprotected-admin-route)` returns exactly one `{ TG-G4, apps/api/admin.ts, confirmed }`; `runCase(clean-guarded)` returns `[]`. (Reuse the `gatesFixture` temp-copy + `git init` prep pattern from `packages/gates/tests/helpers.ts`.)
- [ ] **Step 2: Run → fail.**
- [ ] **Step 3: Implement `run-case.ts`** — copy case dir to temp, `git init`, `scanToFile` then `runGatesToFile`, read `risks.json`, filter to `status === "risk" && gates_under_test.includes(gate_id)`, map to `{ gate_id, path: evidence[0].path, tier: confidenceTier(f) }`.
- [ ] **Step 4: Run → pass. Commit.**

---

### Task 3: Diff + per-tier precision/recall

**Files:**
- Create: `packages/eval/src/metrics.ts`
- Test: `packages/eval/tests/metrics.test.ts`

**Interfaces:**
- Produces: `scoreCase(expected: ExpectedFinding[], actual: ActualFinding[]): { tp, fp, fn, byTier: Record<tier, {tp,fp,fn}> }` (match key `(gate_id,path,tier)`, deduped); `precisionRecall({tp,fp,fn}): { precision: number|null; recall: number|null }` (div-by-zero → `null`).

- [ ] **Step 1: Write the failing tests** — TP/FP/FN classification incl. baseline-noise guard (actual containing non-tested gate findings yields 0 FP — *though `runCase` already filters, `scoreCase` is also fed only gate-scoped actuals; the test documents that contract*); duplicate `(gate_id,path,tier)` dedupes; precision/recall arithmetic incl. div-by-zero → null.
- [ ] **Step 2: Run → fail → Step 3: implement → Step 4: pass. Commit.**

---

### Task 4: Scorecard artifact + the `benchmark` runner

**Files:**
- Create: `packages/eval/src/report.ts`, `packages/eval/src/run.ts` (entry), `packages/eval/bin` wiring or root `pnpm benchmark` script in root `package.json`.
- Test: `packages/eval/tests/report.test.ts`

**Interfaces:**
- Produces: `runBenchmark(corpusDir): BenchmarkReport` where `BenchmarkReport = { schema_version: 1; per_gate: Record<gate, { byTier: Record<tier, {precision,recall,tp,fp,fn}> }>; overall: ...; cases: {name, tp, fp, fn}[] }`; `writeReport(report, outDir)` → `benchmark-report.json` + `benchmark-report.md`.

- [ ] **Step 1: Failing test** — `runBenchmark` over the two seed cases yields G4 `confirmed` recall = 1.0, precision = 1.0 (1 TP from admin-route, 0 FP from clean-guarded). Deterministic: two runs byte-identical JSON.
- [ ] **Step 2: fail → Step 3: implement (aggregate scoreCase across cases, per gate × tier) → Step 4: pass. Commit.**

---

### Task 5: Threshold gating + dogfood CI hook

**Files:**
- Create: `benchmark/thresholds.json`, threshold check in `packages/eval/src/run.ts`.
- Test: `packages/eval/tests/thresholds.test.ts`

**Interfaces:**
- `benchmark/thresholds.json` e.g. `{ "TG-G4": { "confirmed": { "min_recall": 0.85, "min_precision": 0.95 } } }`. The runner returns a non-zero exit (or throws a `ThresholdBreach`) if any configured floor is breached; tiers/gates without a threshold are report-only.

- [ ] **Step 1: Failing test** — a report below `min_recall` → breach (non-zero); at/above → ok. Absent threshold → never breaches.
- [ ] **Step 2: fail → Step 3: implement → Step 4: pass.**
- [ ] **Step 5: CI hook** — add a report-only `pnpm benchmark` step to the dogfood workflow (does NOT fail the build yet unless thresholds are set; surfaces the scorecard). Commit.

---

### Task 6: Full verification

- [ ] `pnpm test` → all pass. `pnpm typecheck` → clean.
- [ ] **Product-path:** `pnpm benchmark` over `benchmark/cases/` prints a scorecard with real G4 confirmed precision/recall = 1.0/1.0 on the seed corpus.
- [ ] `git diff --name-only main HEAD` → only `packages/eval/**`, `benchmark/**`, root `package.json` script, dogfood workflow. No detector/gate/queue/review logic changed (P3 only measures).

---

## Self-Review

**1. Spec coverage:** Decision 1 (gate-scoped corpus) → Task 1. Decision 2 (harness, public surfaces, match key) → Tasks 2–3. Decision 3 (per-tier precision/recall) → Task 3. Decision 4 (scorecard + thresholds) → Tasks 4–5. ✓
**2. Placeholder scan:** Tasks 1/3/4/5 give interfaces + exact behaviors; the seed-case file *contents* are specified in Task 1 Step 3. Full code bodies are written at implementation time (TDD) — acceptable, each task is test-first with concrete assertions. Flag to implementer: the seed `expected.json` should be confirmed against a real `runCase` output (golden-verify), not authored from memory — the harness makes this trivial.
**3. Consistency:** Match key `(gate_id, path, tier)` identical across Tasks 2/3/4. `ActualFinding`/`ExpectedFinding` shapes identical where defined and consumed. Gate-scoping filter applied in `runCase` (Task 2) and re-asserted in metrics (Task 3).

**Known boundary:** the metric counts only `status === "risk"` findings within tested gates; `needs_verification` is deliberately out of scope for precision/recall (it's not a positive claim). Documented, not a gap.
