# Stage A — Honest Scorecard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Aker Build's published benchmark scorecard believable by adding corpus cases for the two failure modes the README already admits, and rendering coverage honesty so "no findings" can never read as false confidence.

**Architecture:** Purely additive to the existing eval pipeline. New benchmark cases are directories under `benchmark/cases/` following the established `expected.json` + `repo/` shape; `loadCases` picks them up with no code change. The only production-code change is a new `coverage` field on the project map. Detector logic is **not** modified in this stage — the new cases are expected to *fail*, and that failure is the deliverable.

**Tech Stack:** TypeScript, Node.js LTS, pnpm, Vitest, Zod.

## Global Constraints

- **Do not modify `benchmark/thresholds.json`.** Floors are 0.90 precision / 0.85 recall; actuals are 1.00. Adding a false-negative case moves recall *down toward* a correctly-placed floor. If CI trips, that is the gate working — the response is to fix the detector or lower the floor as a **recorded decision with a written reason**, never a silent recalibration. (Spec: "Stage A — Depth", Global rule.)
- **Do not modify `packages/scanner/src/detect/data-access.ts` in this stage.** The new cases pin current behaviour as wrong. Fixing the detector is a separate, later decision informed by the measured drop.
- **Synthetic cases only.** No Retail Tower / ERPNext logic (`CLAUDE.md` hard rule).
- **Benchmarks encode truth, not current behavior** — the convention already documented in `benchmark/cases/multiline-tenant-scope/expected.json`. `expected_findings` states what *should* fire.
- **Never `git add -A` or `git add .`.** Stage named files only.
- Detectors stay read-only and evidence-emitting; judgment stays in gates.
- Commit signing is required. If the 1Password SSH agent is locked, commits will fail — unlock it rather than bypassing with `--no-gpg-sign`.

## Unapproved assumptions this plan proceeds under

These are owner calls the design surfaced but that have **not** been answered. The plan proceeds under stated assumption; a reviewer should confirm or reject before Task 5 (the README rewrite) lands.

1. **The claim shift** (detectors demoted from headline to supporting evidence, queue promoted). Task 5's README wording assumes it.
2. **How far the scorecard may drop before it is a launch blocker.** This plan deliberately does not set that number; it measures and reports.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `benchmark/cases/window-bleed-false-negative/` | Pins the ±5-line window FN in the flagship gate | Create |
| `benchmark/cases/model-first-orm/` | Pins the receiver-gating miss (`User.findOne(`) | Create |
| `benchmark/cases/clean-auth/` | Hard negative: guarded route, auth detector stays silent | Create |
| `packages/project-map/src/schema.ts` | Add `coverage: {covered, uncovered}` to the map schema | Modify |
| `packages/scanner/src/detect/stack.ts` | Partition detected frameworks into covered/uncovered | Modify |
| `packages/scanner/tests/stack-coverage.test.ts` | Unit-test the partition | Create |
| `README.md` | Scorecard section leads with limitations | Modify |

---

### Task 1: Corpus case — window-bleed false negative

Pins the worst failure class for this product: an **unscoped** query classified as **scoped** because an unrelated neighbouring statement puts a tenant token inside the 5-line window (`data-access.ts:44-51`).

**Files:**
- Create: `benchmark/cases/window-bleed-false-negative/expected.json`
- Create: `benchmark/cases/window-bleed-false-negative/repo/package.json`
- Create: `benchmark/cases/window-bleed-false-negative/repo/src/db.ts`

**Interfaces:**
- Consumes: the `ExpectedFile` shape from `packages/eval/src/types.ts` — `{ description: string; gates_under_test: string[]; expected_findings: ExpectedFinding[] }` where `ExpectedFinding` is `{ gate_id: string; path: string; tier: "confirmed" | "suspected" }`.
- Produces: a corpus case auto-discovered by `loadCases()` (`packages/eval/src/corpus.ts`) — no registration step exists or is needed.

- [ ] **Step 1: Write the case source that triggers the bug**

Create `benchmark/cases/window-bleed-false-negative/repo/src/db.ts`. The first query is genuinely **unscoped**; the `tenantId` token two lines below belongs to a *different* statement and must not scope it.

```typescript
export async function listAllInvoices(db: any) {
  return db.invoice.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function auditFor(db: any, tenantId: string) {
  return db.auditLog.findMany({ where: { tenantId } });
}
```

- [ ] **Step 2: Add the case manifest**

Create `benchmark/cases/window-bleed-false-negative/repo/package.json`:

```json
{
  "name": "window-bleed-false-negative-fixture",
  "private": true,
  "version": "0.0.0"
}
```

- [ ] **Step 3: Write the ground truth**

Create `benchmark/cases/window-bleed-false-negative/expected.json`. Truth: `listAllInvoices` has no tenant filter, so TG-G4 **should** fire on this path.

```json
{
  "description": "GROUND TRUTH: listAllInvoices is unscoped. The tenantId token belongs to auditFor, a separate statement, but falls inside the 5-line window of data-access.ts, so the detector currently misreads the unscoped query as tenant_scoped. This is a FALSE NEGATIVE in the flagship tenant-isolation gate. Expected encodes truth, not current behavior: the finding SHOULD fire. This case is expected to FAIL until the window is statement-bounded.",
  "gates_under_test": ["TG-G4"],
  "expected_findings": [
    { "gate_id": "TG-G4", "path": "src/db.ts", "tier": "suspected" }
  ]
}
```

- [ ] **Step 4: Run the eval harness and confirm the case FAILS**

Run: `pnpm dlx tsx packages/eval/src/bin.ts`

Expected: TG-G4 **recall drops below 1.00** — the harness reports this case as a missed expected finding. A passing result here means the case does not reproduce the bug; re-check that the two functions sit within 5 lines of each other.

Record the exact new recall figure — Task 5 publishes it.

- [ ] **Step 5: Commit**

```bash
git add benchmark/cases/window-bleed-false-negative
git commit -m "test(benchmark): pin window-bleed false negative in TG-G4"
```

---

### Task 2: Corpus case — model-first ORM receiver miss

Pins the second README-admitted limitation: `ORM_QUERY` (`data-access.ts:10-11`) requires the chain to *start* with a known db-handle word, so Mongoose-style `User.findOne(` is invisible.

**Files:**
- Create: `benchmark/cases/model-first-orm/expected.json`
- Create: `benchmark/cases/model-first-orm/repo/package.json`
- Create: `benchmark/cases/model-first-orm/repo/src/models.ts`

**Interfaces:**
- Consumes: same `ExpectedFile` shape as Task 1.
- Produces: a corpus case auto-discovered by `loadCases()`.

- [ ] **Step 1: Write the case source**

Create `benchmark/cases/model-first-orm/repo/src/models.ts`. `User` is a model, not a listed receiver, so the detector never sees this query at all.

```typescript
import { User } from "./schema";

export async function findUserByEmail(email: string) {
  return User.findOne({ email });
}
```

- [ ] **Step 2: Add the case manifest**

Create `benchmark/cases/model-first-orm/repo/package.json`:

```json
{
  "name": "model-first-orm-fixture",
  "private": true,
  "version": "0.0.0"
}
```

- [ ] **Step 3: Write the ground truth**

Create `benchmark/cases/model-first-orm/expected.json`:

```json
{
  "description": "GROUND TRUTH: findUserByEmail queries without a tenant filter, so TG-G4 SHOULD fire. The receiver-gated ORM_QUERY regex only matches chains starting with a known db-handle word (db, prisma, knex, ...), so a model-first call like User.findOne( is never detected. Expected encodes truth, not current behavior. This case is expected to FAIL until framework signature packs land (W3b).",
  "gates_under_test": ["TG-G4"],
  "expected_findings": [
    { "gate_id": "TG-G4", "path": "src/models.ts", "tier": "suspected" }
  ]
}
```

- [ ] **Step 4: Run the eval harness and confirm the case FAILS**

Run: `pnpm dlx tsx packages/eval/src/bin.ts`

Expected: TG-G4 recall drops further. Record the figure.

- [ ] **Step 5: Commit**

```bash
git add benchmark/cases/model-first-orm
git commit -m "test(benchmark): pin model-first ORM receiver miss in TG-G4"
```

---

### Task 3: Hard negative for the auth detector

Adds a case TG-G4 is expected to stay **silent** on, so the auth detector's false-positive rate is measured rather than assumed.

**Scope decision — G7 is deliberately excluded.** The corpus today covers only TG-G3 (3 cases), TG-G4 (9), and TG-G5 (3), and `benchmark/thresholds.json` scores only those three. `g7-observability.ts` exists but has no case and no threshold. Adding a lone *clean* G7 case would create a new row whose precision/recall is undefined or trivially 1.0 — a fresh unfalsifiable number, which is precisely the defect Stage A exists to remove. G7 joins the corpus when it gets a positive case and a threshold together, as its own unit of work.

**Files:**
- Create: `benchmark/cases/clean-auth/expected.json`
- Create: `benchmark/cases/clean-auth/repo/package.json`
- Create: `benchmark/cases/clean-auth/repo/src/routes.ts`

**Interfaces:**
- Consumes: same `ExpectedFile` shape as Task 1. A clean case uses `"expected_findings": []`, the convention already used by `clean-guarded` and `tenant-scoped-clean`.
- Produces: two corpus cases auto-discovered by `loadCases()`.

- [ ] **Step 1: Write the clean-auth source**

Create `benchmark/cases/clean-auth/repo/src/routes.ts` — a properly guarded admin route. TG-G4 must stay silent.

```typescript
import { requireAdmin } from "./middleware";

export function registerRoutes(app: any) {
  app.get("/admin/reports", requireAdmin, async (req: any, res: any) => {
    res.json({ ok: true });
  });
}
```

- [ ] **Step 2: Write the clean-auth manifest and ground truth**

Create `benchmark/cases/clean-auth/repo/package.json`:

```json
{
  "name": "clean-auth-fixture",
  "private": true,
  "version": "0.0.0"
}
```

Create `benchmark/cases/clean-auth/expected.json`:

```json
{
  "description": "GROUND TRUTH: the admin route is guarded by requireAdmin middleware in the handler chain. TG-G4 must stay silent. Hard negative measuring the auth detector's false-positive rate.",
  "gates_under_test": ["TG-G4"],
  "expected_findings": []
}
```

- [ ] **Step 3: Run the eval harness**

Run: `pnpm dlx tsx packages/eval/src/bin.ts`

Expected: the case PASSES (no finding fires). If it fires, that is a newly-measured **false positive** on TG-G4 — record it, do not suppress it, and report it in Task 5's limitations list. A precision drop here is as publishable as the recall drops from Tasks 1–2.

- [ ] **Step 4: Commit**

```bash
git add benchmark/cases/clean-auth
git commit -m "test(benchmark): add guarded-route hard negative for the auth detector"
```

---

### Task 4: Coverage-honesty field on the project map

So "no findings" renders as "no findings **in covered frameworks: express, prisma**". Without this, silent non-coverage reads as safety — the false-confidence failure the spec names.

**Files:**
- Modify: `packages/project-map/src/schema.ts`
- Modify: `packages/scanner/src/detect/stack.ts`
- Test: `packages/scanner/tests/stack-coverage.test.ts` (create; note scanner tests are flat under `tests/`, not nested under `tests/detect/`)

**Interfaces:**
- Consumes: `StackDetection` from `packages/scanner/src/detect/stack.ts:4-9` — `{ runtime: string | null; package_manager: string | null; frameworks: string[]; signals: DetectionSignal[] }`.
- Produces: `coverage: { covered: string[]; uncovered: string[] }`. `covered` lists detected frameworks Aker Build's detectors actually understand; `uncovered` lists detected frameworks they do not. Task 5's README text reads both.

**Design note.** `detectStack` already emits a sorted `frameworks[]` derived from manifest dependencies (`stack.ts:11-21, 38-41`). Coverage is not a new detector — it is the honest *partition* of that existing list into what the detectors cover versus what they do not. Reusing `frameworks[]` keeps this additive and avoids a second, drifting source of truth about which stack a repo uses.

- [ ] **Step 1: Write the failing test**

Create `packages/scanner/tests/stack-coverage.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { partitionCoverage } from "../src/detect/stack.js";

describe("partitionCoverage", () => {
  it("splits detected frameworks into covered and uncovered", () => {
    expect(partitionCoverage(["express", "nextjs", "react"])).toEqual({
      covered: ["express"],
      uncovered: ["nextjs", "react"],
    });
  });

  it("returns empty lists when no frameworks were detected", () => {
    expect(partitionCoverage([])).toEqual({ covered: [], uncovered: [] });
  });

  it("reports everything uncovered when no detected framework is supported", () => {
    expect(partitionCoverage(["vue", "svelte"])).toEqual({
      covered: [],
      uncovered: ["svelte", "vue"],
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/scanner/tests/stack-coverage.test.ts`

Expected: FAIL — `partitionCoverage is not a function`.

- [ ] **Step 3: Implement `partitionCoverage`**

Add to `packages/scanner/src/detect/stack.ts`, below `FRAMEWORK_DEPS`:

```typescript
/**
 * Frameworks whose idioms the current detectors actually recognise. Deliberately short: it must
 * name what is truly covered, never what is aspirationally supported. Growing this list is a W3b
 * task that ships together with the signature packs that justify it.
 */
const COVERED_FRAMEWORKS = new Set(["express"]);

export interface CoverageReport {
  covered: string[];
  uncovered: string[];
}

/**
 * Partition detected frameworks into those the detectors understand and those they do not.
 * Read-only and judgment-free. This is the anti-false-confidence field: it lets "no findings" be
 * rendered as "no findings in covered frameworks", so an unrecognised stack reads as silence
 * rather than as safety. Both lists are sorted for determinism.
 */
export function partitionCoverage(frameworks: string[]): CoverageReport {
  const covered: string[] = [];
  const uncovered: string[] = [];
  for (const fw of frameworks) {
    (COVERED_FRAMEWORKS.has(fw) ? covered : uncovered).push(fw);
  }
  return { covered: covered.sort(), uncovered: uncovered.sort() };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/scanner/tests/stack-coverage.test.ts`

Expected: PASS (3 tests).

- [ ] **Step 5: Add `coverage` to the project-map schema**

Read `packages/project-map/src/schema.ts` first and follow its existing Zod style. Add to the map object:

```typescript
coverage: z
  .object({
    covered: z.array(z.string()).default([]),
    uncovered: z.array(z.string()).default([]),
  })
  .default({ covered: [], uncovered: [] }),
```

Use `.default(...)` so maps written before this field still validate — the output contract stays backward-compatible (ADR-009).

- [ ] **Step 6: Wire it into the emitted map**

Find where the scanner assembles the project map from `detectStack`'s result (grep for `detectStack(` under `packages/scanner/src/`). Populate the new field from the stack detection already in hand:

```typescript
coverage: partitionCoverage(stack.frameworks),
```

Import `partitionCoverage` alongside the existing `detectStack` import. No second filesystem pass is needed — this reuses `frameworks[]` that `detectStack` already computed.

- [ ] **Step 7: Run the full test suite**

Run: `pnpm vitest run`

Expected: PASS. If a project-map snapshot or schema-validation test fails on the new field, update the fixture — the addition is intentional and backward-compatible. If a test fails for any *other* reason, stop and investigate; do not update snapshots to mask it.

- [ ] **Step 8: Commit**

```bash
git add packages/scanner/src/detect/stack.ts packages/scanner/tests/stack-coverage.test.ts packages/project-map/src/schema.ts
git commit -m "feat(scanner): partition detected frameworks into covered and uncovered"
```

Add the scanner file that assembles the map (from Step 6) to the `git add` list if it is a separate file.

---

### Task 5: Rewrite the README scorecard to lead with limitations

The deliverable of Stage A. The number goes **down**, and that is the point.

**Files:**
- Modify: `README.md` (the "Benchmark scorecard" section)

**Interfaces:**
- Consumes: the measured figures recorded in Tasks 1–3, and the `coverage` field from Task 4.
- Produces: the published scorecard. Stage B's real-repo evidence builds on this framing.

**Assumption flag:** the wording below assumes the claim shift (open question 1) is approved. If a reviewer rejects it, keep the honest-numbers structure and revert only the positioning sentence.

- [ ] **Step 1: Regenerate the scorecard**

Run: `pnpm dlx tsx packages/eval/src/bin.ts`

Read `.aker-build/benchmark-report.md` for the exact per-gate × tier figures. Use those numbers verbatim — do not round in your favour.

- [ ] **Step 2: Replace the scorecard section**

In `README.md`, replace the "Benchmark scorecard" section. Substitute the real measured figures for `<precision>` / `<recall>`; keep the structure. Badges must match the table.

```markdown
## Benchmark scorecard

Aker Build's detection quality is measured, not asserted — including where it
fails. A labeled corpus of synthetic multi-tenant failure cases
(`benchmark/cases/`, 18 cases) runs through the real `scan → gates` pipeline;
precision and recall are computed per gate × confidence tier, and CI fails if
they drop below `benchmark/thresholds.json`.

Reproduce every number below with one command; the corpus is in this repo.

| Gate | Tier | Precision | Recall |
|---|---|---|---|
| TG-G3 Migration Safety | confirmed | <precision> | <recall> |
| TG-G3 Migration Safety | suspected | <precision> | <recall> |
| TG-G4 Tenant Isolation | confirmed | <precision> | <recall> |
| TG-G4 Tenant Isolation | suspected | <precision> | <recall> |
| TG-G5 Idempotency | suspected | <precision> | <recall> |

### What we miss

These are corpus cases that currently **fail**. They are published, not hidden,
because a scorecard with no misses is a corpus that is not hard enough.

- **Window bleed (`window-bleed-false-negative`)** — the detector scans a 5-line
  window below a query for a tenant token. A token belonging to a *neighbouring*
  statement can scope an unscoped query, producing a false negative in the
  tenant-isolation gate. Fix requires statement-bounded windows.
- **Model-first ORM calls (`model-first-orm`)** — query detection is gated on a
  known database-handle receiver, so Mongoose-style `User.findOne(` is invisible.
  Fix requires framework signature packs.

Every finding carries an evidence span (`file:line`) and a confidence tier;
`suspected` is the honest-uncertainty channel and never blocks.

### Coverage

The scanner partitions the frameworks it detects into those its detectors
understand and those they do not (`project-map.coverage.covered` /
`.uncovered`), so "no findings" always reads as "no findings **in covered
frameworks**". An unrecognised stack produces silence, and silence is not safety.

Aker Build analyses TypeScript **application-layer** query code. For
database-layer RLS analysis it complements, rather than replaces, tools like
[pgrls](https://github.com/pgrls/pgrls).

Regenerate: `pnpm dlx tsx packages/eval/src/bin.ts` (writes `.aker-build/benchmark-report.{json,md}`).
```

- [ ] **Step 3: Update the badges to match the table**

Immediately above the section, replace the two hardcoded 100% badges with the real measured G4 confirmed figures. A badge contradicting the table below it destroys exactly the credibility this task builds.

- [ ] **Step 4: Verify the numbers match**

Run: `pnpm dlx tsx packages/eval/src/bin.ts`

Expected: every figure in the README table matches `.aker-build/benchmark-report.md`, and both badges match their table rows. Read both side by side and confirm.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: publish honest scorecard with measured misses"
```

---

### Task 6: Verify CI behaviour and record the threshold decision

The moment the plan exists to produce: either the floors hold, or they trip and a human records why.

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-uniqueness-repositioning-design.md` (record the outcome only)

**Interfaces:**
- Consumes: the measured figures from Task 5.
- Produces: a recorded decision. `benchmark/thresholds.json` is either untouched or changed with a written reason.

- [ ] **Step 1: Run the CI gate locally**

Run: `pnpm vitest run packages/eval/tests/ci-gate.test.ts`

- [ ] **Step 2: Record which branch occurred**

Append to the design document's "Open questions for review" section, choosing the branch that actually happened:

- **Floors held** (measured ≥ 0.90 precision / 0.85 recall): record the measured figures and note that the gate is now live — the margin between floor and actual is no longer decorative.
- **Floors tripped**: record the measured figures and state the decision — fix the detector (deferred to a later stage), or lower the floor **with a written reason and the uncovered pattern documented**. Do not lower it silently. Do not lower it merely to restore green.

- [ ] **Step 3: Run the full verification suite**

Run: `pnpm vitest run`

Expected: all tests pass except any deliberate threshold trip recorded in Step 2.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-30-uniqueness-repositioning-design.md
git commit -m "docs: record Stage A threshold outcome"
```

---

## Stage A exit criteria

- [ ] Scorecard published with at least one sub-1.0 figure.
- [ ] Every README-admitted limitation has a corpus case (`window-bleed-false-negative`, `model-first-orm`).
- [ ] The auth detector has a hard negative (`clean-auth`).
- [ ] `benchmark/thresholds.json` unchanged, or changed with a recorded decision.
- [ ] `coverage.covered` / `.uncovered` emitted on the project map and described in the README.
- [ ] README badges match the README table match the generated report.
- [ ] Corpus count in the README matches `ls benchmark/cases/ | wc -l` (expected: 18).

## Out of scope for Stage A

Detector fixes (statement-bounded windows, framework signature packs), npm publish, real-repo runs, the MCP server, and any change to `thresholds.json` without a recorded decision.
