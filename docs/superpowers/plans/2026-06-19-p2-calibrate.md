# P2 Calibrate / False-Positive Control — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make TenantGuard's findings *believed* — derive a confidence tier from existing evidence, make gate confidence honest (fix the G4 file-level false positive + audit), and thread the tier into routing, PR blocking, and config thresholds.

**Architecture:** A shared pure `confidenceTier(finding)` in `@tenantguard/gates` collapses a finding's evidence confidences (max rule) into `confirmed`/`suspected`. Gate judgment is made honest (route-precise G4, confidence audit). Three consumers read the tier: the queue scorer (new factor), the review/PR verdict (only `confirmed` blocks), and config per-gate `min_tier` thresholds.

**Tech Stack:** TypeScript (ESM, `.js` specifiers), Vitest, Zod. pnpm workspace.

## Global Constraints

- **Two axes, no new vocabulary:** severity stays on `Finding`; confidence stays on `Evidence`. Tier is *derived* (`confirmed` ≡ max-confidence `high`; `suspected` ≡ `medium`/`low`). No new enum field on `Finding`/`Evidence`.
- **Collapse rule (binding):** `tier = max(confidence over finding.evidence)`.
- **Additive/optional only:** `QueueItem.confidence_tier?` is optional; config `min_tier` is optional. No `SCHEMA_VERSION` bump.
- **Gate changes stay narrow:** only G4 route-precision + a confidence-honesty audit. No new gates, no broad rewrite (constitution).
- **Never silent:** a finding suppressed by a `min_tier` threshold is recorded via the audited/expiring suppressions model — never dropped invisibly.
- ESM `.js` import specifiers; never `git add -A`/`.`; stage named files only.
- Verify with `pnpm test` + `pnpm typecheck` (typecheck catches `noUncheckedIndexedAccess` that Vitest misses — always run it).

---

### Task 1: Shared `confidenceTier(finding)` in `@tenantguard/gates`

**Files:**
- Create: `packages/gates/src/confidence.ts`
- Modify: `packages/gates/src/index.ts` (export it)
- Test: `packages/gates/tests/confidence.test.ts`

**Interfaces:**
- Consumes: `Finding` (from `./types.js`), `Evidence` (`{confidence: "high"|"medium"|"low"}`).
- Produces: `confidenceTier(finding: Finding): "confirmed" | "suspected"`. Consumed by Tasks 3 (derive) and 4 (review).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/gates/tests/confidence.test.ts
import { describe, it, expect } from "vitest";
import { confidenceTier } from "../src/confidence.js";
import type { Finding } from "../src/types.js";

const ev = (confidence: "high" | "medium" | "low") => ({
  type: "line" as const, path: "f.ts", line: 1, signal: "s", confidence,
});
const risk = (...c: ("high" | "medium" | "low")[]): Finding => ({
  gate_id: "TG-G4", status: "risk", severity: "high", evidence: c.map(ev),
});

describe("confidenceTier", () => {
  it("confirmed when any evidence is high", () => {
    expect(confidenceTier(risk("medium", "high"))).toBe("confirmed");
  });
  it("confirmed when all high", () => {
    expect(confidenceTier(risk("high", "high"))).toBe("confirmed");
  });
  it("suspected when only medium/low", () => {
    expect(confidenceTier(risk("medium", "low"))).toBe("suspected");
  });
  it("suspected when evidence is empty (no proof)", () => {
    expect(confidenceTier({ gate_id: "TG-G4", status: "risk", severity: "high", evidence: [] })).toBe("suspected");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @tenantguard/gates exec vitest run tests/confidence.test.ts`
Expected: FAIL — cannot import `confidenceTier`.

- [ ] **Step 3: Implement**

```typescript
// packages/gates/src/confidence.ts
import type { Finding } from "./types.js";

/**
 * Collapse a finding's evidence confidences into a tier (P2 Decision 1, max rule):
 * `confirmed` iff at least one evidence item is `high` (a structural proof dominates);
 * otherwise `suspected`. Empty evidence → `suspected` (no proof). Pure; no side effects.
 */
export function confidenceTier(finding: Finding): "confirmed" | "suspected" {
  return finding.evidence.some((e) => e.confidence === "high") ? "confirmed" : "suspected";
}
```

- [ ] **Step 4: Export from the package**

In `packages/gates/src/index.ts`, add: `export { confidenceTier } from "./confidence.js";`

- [ ] **Step 5: Run to verify pass**

Run: `pnpm --filter @tenantguard/gates exec vitest run tests/confidence.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/gates/src/confidence.ts packages/gates/src/index.ts packages/gates/tests/confidence.test.ts
git commit -m "feat(gates): add shared confidenceTier(finding) collapse helper"
```

---

### Task 2: Fix G4 to be route-precise (Decision 0.1)

**Files:**
- Modify: `packages/gates/src/gates/g4-security.ts`
- Test: `packages/gates/tests/g4-route-precision.test.ts` (create)

**Interfaces:**
- Behavior change only: a file with a guarded route + an unguarded route flags ONLY the unguarded one. Today (`g4-security.ts:27`) it flags every route when one `AUTH_GUARD` token is absent file-wide.

**Approach (confidence-varied, so it composes with the tier machinery):** a route line with an
`AUTH_GUARD` token *on the line* is guarded → no finding. For an unguarded route line, the
confidence depends on file-level evidence, because router-level middleware (`router.use(requireAuth)`
above the routes) is the dominant real-world guard pattern and won't appear on the route line:

- no `AUTH_GUARD` token *anywhere* in the file → provably unguarded → `confidence: "high"`
  (→ `confirmed`, may block).
- `AUTH_GUARD` token present in the file but not on the route line → *might* be middleware-protected,
  cannot prove → `confidence: "medium"` (→ `suspected`, advisory only, never blocks).

This is the honest version: the uncertain case self-demotes to `suspected` instead of dishonestly
gating. It is ~3 lines (a file-level `AUTH_GUARD.test(content)` choosing high vs medium).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/gates/tests/g4-route-precision.test.ts
import { describe, it, expect } from "vitest";
import { g4Security } from "../src/gates/g4-security.js";
import type { GateContext } from "../src/types.js";

// Minimal in-memory GateContext stub (mirror existing g4 tests' helper shape).
function ctxWith(file: string, content: string): GateContext {
  return {
    projectMap: { critical_surfaces: [] } as never,
    repoRoot: "/x",
    listFiles: () => [file],
    fileExists: () => true,
    readFileSafe: (_r: string, p: string) => (p === file ? content : null),
  } as unknown as GateContext;
}

describe("G4 route precision", () => {
  it("flags only the unguarded route in a file that has a guarded one too", () => {
    const f = "api.ts";
    const content = [
      `app.get("/safe", requireAuth, handler);`,
      `app.get("/open", handler);`,
    ].join("\n");
    const findings = g4Security.run(ctxWith(f, content));
    const routeFindings = findings.filter((x) =>
      x.evidence.some((e) => e.signal.includes("auth guard")),
    );
    expect(routeFindings).toHaveLength(1);
    expect(routeFindings[0]?.evidence[0]?.line).toBe(2);
  });

  it("flags nothing when every route is guarded on its line", () => {
    const f = "api.ts";
    const content = `app.get("/a", requireAuth, h);\napp.post("/b", authenticate, h);`;
    const findings = g4Security.run(ctxWith(f, content));
    expect(findings.filter((x) => x.evidence.some((e) => e.signal.includes("auth guard")))).toHaveLength(0);
  });

  it("emits HIGH confidence when no auth token appears anywhere in the file", () => {
    const findings = g4Security.run(ctxWith("api.ts", `app.get("/open", handler);`));
    const rf = findings.filter((x) => x.evidence.some((e) => e.signal.includes("auth guard")));
    expect(rf).toHaveLength(1);
    expect(rf[0]?.evidence[0]?.confidence).toBe("high");
  });

  it("emits MEDIUM confidence for a route when a guard token exists in the file but not on the route line (possible middleware)", () => {
    const f = "api.ts";
    const content = `router.use(requireAuth);\nrouter.get("/users", handler);`;
    const findings = g4Security.run(ctxWith(f, content));
    const rf = findings.filter((x) => x.evidence.some((e) => e.signal.includes("auth guard")));
    expect(rf).toHaveLength(1);
    expect(rf[0]?.evidence[0]?.confidence).toBe("medium");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @tenantguard/gates exec vitest run tests/g4-route-precision.test.ts`
Expected: FAIL — current file-level logic flags both routes / flags guarded ones.

- [ ] **Step 3: Make G4 route-precise**

In `packages/gates/src/gates/g4-security.ts`, replace the file-level `hasAuthGuard` check (the `const hasAuthGuard = AUTH_GUARD.test(content);` + the `if (!hasAuthGuard)` inside the route loop) with a per-line check: for each line matching `ROUTE_DEF`, the route is unguarded iff `AUTH_GUARD` does NOT match *that same line*. Emit the finding only for unguarded route lines.

```typescript
    const fileHasGuard = AUTH_GUARD.test(content); // file-level middleware may guard routes
    const lines = content.split(/\r?\n/);
    for (const line of matchingLines(content, ROUTE_DEF)) {
      const text = lines[line - 1] ?? "";
      if (AUTH_GUARD.test(text)) continue; // guarded on its own line → fine
      // Unguarded line: HIGH (provably unguarded — no token in file) vs MEDIUM (token elsewhere,
      // possibly middleware — cannot prove, so demote to suspected).
      const confidence = fileHasGuard ? "medium" : "high";
      findings.push(
        risk(ID, "high", [
          lineEvidence(file, line, "API route without an auth guard", confidence),
        ]),
      );
    }
```

(Leave the admin-role and secret-in-log checks unchanged. Note: the finding *severity* stays
`high` — "how bad if real"; the *evidence confidence* varies — "how sure". The tier machinery in
Tasks 1/4/5 then routes/blocks on the confidence.)

- [ ] **Step 4: Run to verify pass + existing g4 suite**

Run: `pnpm --filter @tenantguard/gates exec vitest run tests/g4-route-precision.test.ts && pnpm --filter @tenantguard/gates test`
Expected: PASS. If an existing g4 test asserted the old file-wide behavior, update it deliberately (the old behavior was the bug) and note it in the commit.

- [ ] **Step 5: Commit**

```bash
git add packages/gates/src/gates/g4-security.ts packages/gates/tests/g4-route-precision.test.ts
git commit -m "fix(gates): make G4 auth-guard check route-precise, not file-level"
```

---

### Task 3: Confidence-honesty audit (Decision 0.2)

**Files:**
- Modify: any gate in `packages/gates/src/gates/*.ts` whose `lineEvidence`/`fileEvidence` confidence arg overstates.
- Test: `packages/gates/tests/confidence-honesty.test.ts` (create)

**Rule:** structural/line-precise proof → `high`; name/heuristic inference → `medium`; absence / needs-external-evidence → `low`.

- [ ] **Step 1: Audit (read, don't guess)**

Run: `grep -rn 'lineEvidence\|fileEvidence\|missingEvidence' packages/gates/src/gates/*.ts`
For each, classify the signal: is it a structural match (a literal pattern at a line) or a heuristic (a name looks like X)? The known overstatement is G4's route finding (line-precise → `high` is actually correct *after* Task 2, since the route line is structural). Most gates already comply (verified spread: 11 high / 11 medium / 13 low). Record any that overstate.

- [ ] **Step 2: Write characterization tests for the rule**

```typescript
// packages/gates/tests/confidence-honesty.test.ts — assert representative findings carry the
// honest tier. Example: G5 webhook heuristic is medium; G7 missing-log is low; G4 route is high.
```
(Fill with concrete per-gate assertions for the gates touched; one `it` per gate asserting the confidence of a representative finding.)

- [ ] **Step 3: Correct any overstatements**

Adjust only the confidence args that violate the rule. Targeted edits, not rewrites.

- [ ] **Step 4: Run gates suite**

Run: `pnpm --filter @tenantguard/gates test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/gates/src/gates packages/gates/tests/confidence-honesty.test.ts
git commit -m "fix(gates): audit evidence confidence to reflect structural vs heuristic proof"
```

---

### Task 4: Queue scorer + derive — confidence factor (Decision 3.1)

**Files:**
- Modify: `packages/queue/src/types.ts` (add `confidence_tier?` to `QueueItem`)
- Modify: `packages/queue/src/schema.ts` (optional field)
- Modify: `packages/queue/src/derive.ts` (set it via `confidenceTier`)
- Modify: `packages/queue/src/score.ts` (new factor)
- Test: `packages/queue/tests/confidence-routing.test.ts` (create)

**Interfaces:**
- Consumes: `confidenceTier` (Task 1).
- Produces: `QueueItem.confidence_tier?: "confirmed" | "suspected"`; a `confidence` factor in `ScoreBreakdown`.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/queue/tests/confidence-routing.test.ts — at equal severity, a confirmed item scores
// higher than a suspected one; assert the weights still sum to 1.0.
```
(Construct two QueueItems differing only in `confidence_tier`; assert `scoreItem(confirmed).total > scoreItem(suspected).total`, and assert the sum of factor weights === 1.0.)

- [ ] **Step 2: Run to verify fail**

Run: `pnpm --filter @tenantguard/queue exec vitest run tests/confidence-routing.test.ts`
Expected: FAIL.

- [ ] **Step 3: Add the optional field (types + schema)**

`types.ts`: add `confidence_tier?: "confirmed" | "suspected";` to `QueueItem`.
`schema.ts`: add `confidence_tier: z.enum(["confirmed", "suspected"]).optional()`.

- [ ] **Step 4: Set it in derive**

In `derive.ts`, import `confidenceTier` from `@tenantguard/gates`; in the item map, add `confidence_tier: confidenceTier(f)`.

- [ ] **Step 5: Add the scoring factor**

In `score.ts`: reduce the `risk` factor weight from 0.2 to 0.1 and add a new factor
`{ name: "confidence", weight: 0.1, value: item.confidence_tier === "suspected" ? 0 : 1, note: \`tier=${item.confidence_tier ?? "confirmed"}\` }`.
(Weights remain: 0.35 + 0.1 + 0.15 + 0.1 + 0.1 + 0.1 + 0.1 = 1.0.) Update any existing score test that asserted the old `risk` weight/total — deliberately.

- [ ] **Step 6: Run + full queue suite**

Run: `pnpm --filter @tenantguard/queue exec vitest run tests/confidence-routing.test.ts && pnpm --filter @tenantguard/queue test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/queue/src/types.ts packages/queue/src/schema.ts packages/queue/src/derive.ts packages/queue/src/score.ts packages/queue/tests/confidence-routing.test.ts
git commit -m "feat(queue): route by confidence tier (confirmed outranks suspected at equal severity)"
```

---

### Task 5: Review/PR — only `confirmed` flips the verdict (Decision 3.2)

**Files:**
- Modify: `packages/review/src/pr.ts`
- Test: `packages/review/tests/confidence-gating.test.ts` (create), and check existing `risk-blocks.test.ts`.

**Interfaces:**
- Consumes: `confidenceTier` (Task 1); `risks.findings` (already used at `pr.ts:51`).

- [ ] **Step 1: Read `pr.ts` fully** to see exactly how the verdict is computed from `attributable` findings (the Ready/Not-Ready decision point).

- [ ] **Step 2: Write the failing test**

```typescript
// packages/review/tests/confidence-gating.test.ts — a diff attributable only to suspected
// findings yields Ready; a diff with a confirmed finding yields Not Ready.
```

- [ ] **Step 3: Run to verify fail**

Run: `pnpm --filter @tenantguard/review exec vitest run tests/confidence-gating.test.ts`
Expected: FAIL (today any attributable risk can flip the verdict).

- [ ] **Step 4: Apply the gating rule**

In `pr.ts`, when computing the verdict, only findings with `confidenceTier(f) === "confirmed"` may drive *Not Ready*. `suspected` findings still render in the report as advisory, but do not flip the verdict. Import `confidenceTier` from `@tenantguard/gates`.

- [ ] **Step 5: Run + full review suite**

Run: `pnpm --filter @tenantguard/review exec vitest run tests/confidence-gating.test.ts && pnpm --filter @tenantguard/review test`
Expected: PASS. Update `risk-blocks.test.ts` if it asserted suspected findings blocking — deliberately.

- [ ] **Step 6: Commit**

```bash
git add packages/review/src/pr.ts packages/review/tests/confidence-gating.test.ts
git commit -m "feat(review): only confirmed findings flip the PR verdict to Not Ready"
```

---

### Task 6: Config per-gate `min_tier` threshold (Decision 3.3)

**Files:**
- Modify: `packages/config/src/index.ts` (schema + filter)
- Modify: wherever findings are surfaced post-gates with config applied (check `packages/gates/src/context.ts` / suppressions path).
- Test: `packages/config/tests/min-tier.test.ts` (create)

**Interfaces:**
- A repo config may set `{ "gates": { "TG-G7": { "min_tier": "confirmed" } } }`. A finding below the gate's `min_tier` is suppressed via the audited/expiring suppressions model — recorded, never silently dropped. No config ≡ surface everything.

- [ ] **Step 1: Read** `packages/config/src/index.ts` and the suppressions model (`packages/gates/src/suppressions.ts`) to follow the existing audited-suppression shape — reuse it, don't invent.

- [ ] **Step 2: Write the failing test**

```typescript
// packages/config/tests/min-tier.test.ts — with min_tier: confirmed for TG-G7, a suspected
// G7 finding is suppressed WITH an audit record; a confirmed one survives; no-config surfaces all.
```

- [ ] **Step 3: Run to verify fail** → implement schema + filter → **Step 4: run to pass.**

(Schema: extend config with optional `gates: Record<string, { min_tier?: "confirmed" | "suspected" }>`. Filter: when applying config to the risk list, demote-to-suppressed any finding whose `confidenceTier` is below the gate's `min_tier`, attaching the same audited suppression metadata used elsewhere.)

- [ ] **Step 5: Commit**

```bash
git add packages/config/src/index.ts packages/config/tests/min-tier.test.ts <surfacing file>
git commit -m "feat(config): per-gate min_tier suppresses below-tier findings (audited, never silent)"
```

---

### Task 7: Full workspace verification

- [ ] `pnpm test` → PASS all packages.
- [ ] `pnpm typecheck` → clean.
- [ ] **Product-path smoke:** run a real `scan` → `gates` → `queue`/`route` and confirm a `suspected` finding does not flip a PR verdict and a `confirmed` one does.
- [ ] `git diff --name-only main HEAD` → only `packages/gates`, `packages/queue`, `packages/review`, `packages/config` (+ plan/spec docs). No detector/scanner changes (P1 done).

---

## Self-Review

**1. Spec coverage (design → tasks):** Decision 1 (collapse) → Task 1. Decision 0.1 (G4 precision) → Task 2. Decision 0.2 (honesty audit) → Task 3. Decision 3.1 (scorer) → Task 4. Decision 3.2 (review blocking) → Task 5. Decision 3.3 (config min_tier) → Task 6. ✓

**2. Placeholder scan:** Tasks 3, 5, 6 contain test *descriptions* rather than full test bodies where the exact existing-code shape must be read first (the design flags these as "read X fully before writing"). These are bounded by an exact `grep`/`read` step + the precise assertion to make — acceptable, but the implementer MUST read the named file before writing the test. Tasks 1, 2, 4 have full code. (If stricter no-placeholder fidelity is wanted, expand 3/5/6 after reading those files.)

**3. Consistency:** `confidenceTier(finding)` signature identical across Tasks 1/4/5. Tier values `"confirmed"|"suspected"` identical in helper, QueueItem field, config enum. Weight sum re-verified = 1.0 in Task 4.

**Known risk:** Tasks 3/5/6 depend on reading existing code shapes not fully loaded at plan time — the first action in each is a read. This is the same "verify the consumer's inputs" discipline that caught the QueueItem-vs-Finding error during design.
