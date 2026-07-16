# W3a Detection Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kill defect D3 (multi-line ORM tenant filters misread as violations) and the dogfood self-scan noise (~39 suspected FPs) by making the data-access detector receiver-gated and window-aware, then prove it in the benchmark and refresh the scorecard.

**Architecture:** First slice of spec workstream W3 (`docs/superpowers/specs/2026-07-16-defect-assessment-and-uniqueness-fortification-design.md`). The detector stays a read-only, evidence-emitting, single-file regex scanner — no AST, no new architecture. W3b (framework signature packs + coverage-honesty field) is a separate later plan.

**Tech Stack:** TypeScript, pnpm workspaces, Vitest, existing `@tenantguard/scanner` / `@tenantguard/gates` / `@tenantguard/eval` packages.

## Design decisions (locked, per approved spec W3 + final-review follow-ups)

1. **Receiver gating:** an ORM/builder method call (`find(`, `select(`, …) only counts as a query site when its call chain STARTS with a db-ish receiver word (`db`, `prisma`, `knex`, `sequelize`, `orm`, `repo`, `repository`, `client`, `conn`, `connection`, `pool`, `tx`, `trx`, `store`, `datastore`, `typeorm`, `drizzle`). Bare `items.find(` / `suppressions.find(` no longer match — this kills the dominant self-scan FP class. Raw SQL statements count regardless of receiver (unchanged).
2. **Statement window:** tenant-token search covers the match line plus the next 5 lines (multi-line builder calls like Prisma's `where:` on the following line). Fixed window, no paren balancing — YAGNI.
3. **Confidence honesty:** same-line tenant token → `tenant_scoped`/`high` (unchanged). Any window-based classification (scoped-via-window OR no-token-in-window) → `medium`, because a 6-line regex window can neither prove presence robustly nor prove absence. `no_tenant_filter` therefore drops from `high` to `medium` — G4's finding stays `suspected`-tier either way (G4 already emits its own `medium` evidence), so no downstream tier change.
4. **G4 stays at `suspected` for data-access findings.** Upgrading to `confirmed` waits until the receiver-gated detector has a proven FP≈0 record across at least one more eval cycle. Not in this plan.
5. **Dogfood config:** repo-local `tenantguard.config.json` excludes fixture/benchmark dirs. CONSTRAINT: `matchesPathPattern` (packages/config/src/index.ts:157-160) treats `foo/**` with a LITERAL prefix compare — wildcard prefixes like `packages/*/tests/**` silently match nothing, so every exclude must be a literal dir prefix.

## Global Constraints

- Constitution: read-only detection; no secrets stored or printed; synthetic fixtures only; no broad refactors.
- Benchmark ground-truth rule: expected.json encodes GROUND TRUTH, never current-engine behavior.
- Confidence tiers encode uncertainty; never hide it (`confirmed` requires ≥1 `high` evidence).
- Git: stage NAMED files only (never `git add -A` / `git add .`); commit format `<type>: <description>`; commits use `--no-gpg-sign` (user-authorized this session); no push/PR/merge without explicit user request.
- Branch: `w3a-detection-precision` cut from up-to-date `main`.
- Verification before any "done" claim: targeted suites (`scanner`, `gates`, `eval`) + `pnpm typecheck` + `pnpm dlx tsx packages/eval/src/bin.ts` exit 0. (Full `pnpm test` has 6 pre-existing environmental failures in `packages/github-app-server` — local 1Password signing — unrelated and expected.)

---

### Task 0: Branch setup

- [ ] **Step 1:**

```bash
git checkout main && git pull --ff-only origin main && git checkout -b w3a-detection-precision
```

Also commit this plan file first:

```bash
git add docs/superpowers/plans/2026-07-16-w3a-detection-precision.md
git commit --no-gpg-sign -m "docs: W3a detection-precision plan"
```

---

### Task 1: Data-access detector v2 — receiver gating + statement window

**Files:**
- Modify: `packages/scanner/src/detect/data-access.ts` (full rewrite below)
- Modify: `packages/scanner/tests/data-access.test.ts` (update 2 expectations, add 3 tests)
- Modify: `packages/gates/tests/fixtures/data-access/src/db.ts` + `packages/gates/tests/g4-data-access.test.ts` (see Step 5 — the fixture's tenant-scoped query currently sits inside the new 5-line window of the unscoped query and must move below it)
- Possibly modify: `packages/scanner/tests/fixtures/saas/**` (only if `p1-integration.test.ts` fails — see Step 5)

**Interfaces:**
- Consumes: `readFileSafe` from `../io.js`; `Evidence` from `@tenantguard/project-map` (unchanged).
- Produces: same `detectDataAccess(root, files): Evidence[]` signature; same signals `tenant_scoped`/`no_tenant_filter`; NEW confidence semantics (decision 3). G4 (`packages/gates/src/gates/g4-security.ts`) consumes only `signal`/`path`/`line` — no gate change needed.

- [ ] **Step 1: Update + add tests (failing first)**

In `packages/scanner/tests/data-access.test.ts`:

(a) In the test "flags an ORM query with no tenant filter as signal no_tenant_filter", change the expected `confidence` from `"high"` to `"medium"` (decision 3: absence is window-judged, never provable).

(b) In the vocabulary test at the top, leave as-is (it only asserts the shape).

(c) Add these tests inside `describe("detectDataAccess", ...)`:

```ts
  it("classifies a multi-line ORM call with the tenant token in the statement window as tenant_scoped (medium)", () => {
    const root = fixture({
      "invoices.ts": `export function list(prisma, tenantId) {\n  return prisma.invoice.findMany({\n    where: { tenantId },\n  });\n}\n`,
    });
    const ev = detectDataAccess(root, ["invoices.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ line: 2, signal: "tenant_scoped", confidence: "medium" });
  });

  it("ignores bare array/Map method calls (no db-ish receiver)", () => {
    const root = fixture({
      "util.ts": `export const active = (users) => users.find((u) => u.active);\nexport const drop = (m, k) => m.delete(k);\n`,
    });
    expect(detectDataAccess(root, ["util.ts"])).toEqual([]);
  });

  it("still counts raw SQL regardless of receiver", () => {
    const root = fixture({
      "raw.ts": `export const q = () => run("SELECT id FROM invoices WHERE status = 'open'");\n`,
    });
    const ev = detectDataAccess(root, ["raw.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]?.signal).toBe("no_tenant_filter");
  });
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `pnpm --filter @tenantguard/scanner test -- data-access`
Expected: FAIL — multi-line case currently yields `no_tenant_filter`; bare-array case currently yields 2 findings; the confidence change fails.

- [ ] **Step 3: Rewrite the detector**

Replace the constants + loop body in `packages/scanner/src/detect/data-access.ts` with:

```ts
import { readFileSafe } from "../io.js";
import type { Evidence } from "@tenantguard/project-map";

// Only inspect source files that plausibly contain query code.
const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;

// A db-ish receiver chain followed by a query/builder method. Receiver gating (W3a): bare
// `items.find(` / `map.delete(` are array/Map calls, not queries — the chain must START with a
// word that names a database handle. Raw SQL counts regardless of receiver.
const ORM_QUERY =
  /\b(db|prisma|knex|sequelize|orm|repo|repository|client|conn|connection|pool|tx|trx|store|datastore|typeorm|drizzle)\b[\w.]*\.\s*(find|findMany|findFirst|findUnique|findOne|select|update|delete|insert|create)\s*\(/i;
const RAW_SQL =
  /\b(SELECT|UPDATE|DELETE|INSERT)\b[\s\S]{0,80}\bFROM\b|\bUPDATE\b\s+\w+\s+\bSET\b/i;

// A tenant-id token scoping the statement.
const TENANT_TOKEN = /\btenant_?id\b|\borg_?id\b|\baccount_?id\b/i;

// Statement window: the match line plus the next 5 lines (multi-line builder calls put the
// `where:` clause below the call). A regex window can neither prove presence robustly nor prove
// absence, so every window-based classification is emitted at medium confidence; only a
// same-line tenant token is high.
const WINDOW_LINES = 5;

/**
 * Detect database access sites as normative Evidence. Read-only: records WHERE a query happens
 * and encodes tenant-scoping in the signal ("tenant_scoped" vs "no_tenant_filter"). Never judges
 * and never stores a value. Returned sorted by path then line (determinism). Honesty: no sites
 * -> empty array.
 */
export function detectDataAccess(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      if (!ORM_QUERY.test(text) && !RAW_SQL.test(text)) continue;
      if (TENANT_TOKEN.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "tenant_scoped", confidence: "high" });
        continue;
      }
      const window = lines.slice(i + 1, i + 1 + WINDOW_LINES).join("\n");
      out.push({
        type: "line",
        path: rel,
        line: i + 1,
        signal: TENANT_TOKEN.test(window) ? "tenant_scoped" : "no_tenant_filter",
        confidence: "medium",
      });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
```

- [ ] **Step 4: Run the detector tests**

Run: `pnpm --filter @tenantguard/scanner test -- data-access`
Expected: PASS (all, including the updated confidence expectation).

- [ ] **Step 5: Run the full scanner + gates suites**

Run: `pnpm --filter @tenantguard/scanner test` and `pnpm --filter @tenantguard/gates test`
Expected: scanner PASS (if `p1-integration.test.ts` fails on its `data_access` assertions, inspect `packages/scanner/tests/fixtures/saas/` — its query lines may lack a db-ish receiver; fix the FIXTURE by renaming the receiver to `db`/`prisma`, never the gating).

The gates suite WILL fail until you fix its fixture: in `packages/gates/tests/fixtures/data-access/src/db.ts` the tenant-scoped query is on line 6, inside the line-2 query's new 5-line window, so line 2 would be misread as `tenant_scoped`. Replace the fixture with (tenant query moved below the window):

```ts
export async function listInvoices(db: any) {
  return db.select("SELECT * FROM invoices WHERE status = 'open'");
}

// The scoped variant lives far enough below that it cannot fall inside the
// unscoped query's statement window (W3a: match line + 5 lines).

export async function listTenantInvoices(db: any, tenantId: string) {
  return db.select("SELECT * FROM invoices WHERE tenant_id = $1", [tenantId]);
}
```

and in `packages/gates/tests/g4-data-access.test.ts` update the second test's line filter from `e.line === 6` to `e.line === 9` (the tenant-scoped query's new line). The first test's expectations (one finding, `src/db.ts` line 2, tier `suspected`) are unchanged.

- [ ] **Step 6: Commit**

```bash
git add packages/scanner/src/detect/data-access.ts packages/scanner/tests/data-access.test.ts packages/gates/tests/fixtures/data-access/src/db.ts packages/gates/tests/g4-data-access.test.ts
git commit --no-gpg-sign -m "feat(scanner): receiver-gated, window-aware data-access detector (W3a, kills D3)"
```

(Include any additional fixture files you had to adjust in the named `git add`.)

---

### Task 2: Benchmark — hard negative for receiver gating; verify D3 case flips green

**Files:**
- Create: `benchmark/cases/bare-array-method/{expected.json, repo/package.json, repo/src/util.ts}`

**Interfaces:**
- Consumes: Task 1's detector semantics; the eval harness match key `(gate_id, path, tier)`.
- Produces: corpus grows to 15 cases; TG-G4 suspected tier becomes 2 TP / 0 FP / 0 FN (the `multiline-tenant-scope` FP disappears).

- [ ] **Step 1: Create the case**

`repo/package.json`:

```json
{ "name": "fixture", "private": true }
```

`repo/src/util.ts`:

```ts
export function activeUsers(users: { active: boolean }[]) {
  return users.find((u) => u.active);
}

export function evict(cache: Map<string, string>, key: string) {
  return cache.delete(key);
}
```

`expected.json`:

```json
{
  "description": "Bare array/Map method calls (users.find, cache.delete) are not DB queries. Ground truth: nothing fires. Hard negative pinning W3a receiver gating — before W3a these were the dominant false-positive class on TenantGuard's own source.",
  "gates_under_test": ["TG-G4"],
  "expected_findings": []
}
```

- [ ] **Step 2: Run the eval suite and full benchmark**

Run: `pnpm --filter @tenantguard/eval test`
Expected: PASS.
Run: `pnpm dlx tsx packages/eval/src/bin.ts`
Expected: exit 0, "All thresholds met."; Cases table has 15 rows; `multiline-tenant-scope` now scores 0 TP / 0 FP / 0 FN; `bare-array-method` 0/0/0; TG-G4 suspected row: 2 TP / 0 FP / 0 FN → precision 100% / recall 100%. If TG-G4 suspected FP is not 0, the detector missed something — debug the detector (Task 1), do not touch expected.json files.

- [ ] **Step 3: Commit**

```bash
git add benchmark/cases/bare-array-method
git commit --no-gpg-sign -m "feat(eval): bare-array-method hard negative — receiver gating pinned; D3 case now green"
```

---

### Task 3: Dogfood config — exclude fixture/benchmark dirs + composition test

**Files:**
- Create: `tenantguard.config.json` (repo root)
- Create: `packages/gates/tests/config-composition.test.ts`

**Interfaces:**
- Consumes: `loadConfig`/`filterPaths` (packages/config/src/index.ts); gates `runGatesToFile`/`buildContext` config path (013); `min_tier` gating (P2).
- Produces: dogfood self-scan no longer reports findings from `benchmark/**`, test fixtures, or `examples/**`; ADR-012 follow-up #1 (path-scope × min_tier composition test) closed.

- [ ] **Step 1: Create the config (LITERAL dir prefixes only — see design decision 5)**

`tenantguard.config.json`:

```json
{
  "version": 1,
  "project": { "name": "tenantguard", "type": "cli-kernel" },
  "paths": {
    "exclude": [
      "benchmark/**",
      "packages/gates/tests/fixtures/**",
      "packages/scanner/tests/fixtures/**",
      "examples/**"
    ]
  }
}
```

- [ ] **Step 2: Measure the dogfood effect (before/after evidence for the report)**

```bash
git stash push tenantguard.config.json && pnpm dlx tsx packages/cli/src/bin.ts scan --out .tenantguard && pnpm dlx tsx packages/cli/src/bin.ts gates --out .tenantguard && node -e "const r=require('./.tenantguard/risks.json'); console.log('findings WITHOUT config:', r.findings.length)"
git stash pop && pnpm dlx tsx packages/cli/src/bin.ts scan --out .tenantguard && pnpm dlx tsx packages/cli/src/bin.ts gates --out .tenantguard && node -e "const r=require('./.tenantguard/risks.json'); console.log('findings WITH config:', r.findings.length)"
```

Expected: the WITH count is meaningfully lower (fixture/benchmark/example findings gone — including the `secret-in-log` fixture's confirmed-critical), and the remaining data-access findings drop sharply versus the pre-W3a count (~39) thanks to Task 1's receiver gating. Record both numbers in your report.

- [ ] **Step 3: Write the composition test (ADR-012 follow-up)**

`packages/gates/tests/config-composition.test.ts` — assert that `paths.exclude` and `gates.*.min_tier` compose in one config. Build a fixture repo (reuse the `gatesFixture`-style temp-dir pattern from `packages/gates/tests/helpers.ts`, but write the config file into the fixture root before scanning) containing:
- `excluded/admin.ts` — an unguarded admin route (would fire TG-G4) under an excluded path
- `kept/admin.ts` — the same content under a kept path
- config: `{ "version": 1, "paths": { "exclude": ["excluded/**"] }, "gates": { "TG-G4": { "min_tier": "confirmed" } } }`

Assert: (1) no finding references `excluded/admin.ts` in any status; (2) `kept/admin.ts` findings at `suspected` tier carry a suppression record (min_tier audit metadata) rather than being silently dropped; (3) `confirmed`-tier findings on `kept/admin.ts` surface normally. Write the test first, watch it run (it may pass immediately — that is the point: it documents that the composition WORKS; if it fails, you found a real 013×P2 bug — STOP and report BLOCKED with the failure).

- [ ] **Step 4: Run gates suite**

Run: `pnpm --filter @tenantguard/gates test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tenantguard.config.json packages/gates/tests/config-composition.test.ts
git commit --no-gpg-sign -m "feat(config): dogfood path excludes + path-scope x min_tier composition test (ADR-012 follow-up)"
```

---

### Task 4: Scorecard refresh + doc follow-ups

**Files:**
- Modify: `README.md` (scorecard section)
- Modify: `packages/eval/src/bin.ts` (stale header comment)
- Modify: `specs/013-config-path-scope-enforcement/tasks.md` (tick T014–T016 — ADR-012 follow-up)

- [ ] **Step 1: Refresh the README scorecard**

Run `pnpm dlx tsx packages/eval/src/bin.ts` and update the README's "Benchmark scorecard" section with the ACTUAL numbers (expected: TG-G4 suspected precision rises 67% → 100%; case count 14 → 15). Replace the known-gap sentence ("Known gap: one suspected-tier false positive from multi-line ORM tenant filters…") with:

```markdown
The multi-line ORM false positive documented in earlier scorecards is fixed by
W3a's windowed, receiver-gated detector; the corpus pins both behaviors
(`multiline-tenant-scope`, `bare-array-method`) so they cannot regress silently.
```

- [ ] **Step 2: Fix the stale bin.ts comment**

In `packages/eval/src/bin.ts` header comment, replace the sentence claiming the CI gate runs only "via vitest" with one stating both paths: the vitest CI gate (`packages/eval/tests/ci-gate.test.ts`) AND the dogfood workflow's `benchmark` job run this bin directly on PRs.

- [ ] **Step 3: Tick 013's completed tasks**

In `specs/013-config-path-scope-enforcement/tasks.md`, mark T014–T016 as done (`- [x]`) — ADR-012 verified their underlying validations pass.

- [ ] **Step 4: Final verification**

Run: `pnpm --filter @tenantguard/scanner test && pnpm --filter @tenantguard/gates test && pnpm --filter @tenantguard/eval test && pnpm typecheck && pnpm dlx tsx packages/eval/src/bin.ts`
Expected: all PASS; benchmark exit 0; README table matches printed table exactly.

- [ ] **Step 5: Commit**

```bash
git add README.md packages/eval/src/bin.ts specs/013-config-path-scope-enforcement/tasks.md
git commit --no-gpg-sign -m "docs: scorecard refresh (G4 suspected 100%), bin comment, 013 task ticks"
```

Then STOP and report: branch state, before/after dogfood finding counts, new scorecard, and that push/PR await the user's request.
