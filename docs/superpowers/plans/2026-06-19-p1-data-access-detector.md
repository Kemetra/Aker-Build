# P1 Data-Access Detector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `data-access` detector that emits structural evidence of DB query sites and whether each carries a tenant-id filter — the first slice of the Fortify roadmap (P1).

**Architecture:** A new detector module under `packages/scanner/src/detect/` follows the exact pattern of `secrets.ts` / `stack.ts`: a pure function `(root, files) => Evidence[]` that reads files via the existing `readFileSafe` io primitive and emits **normative `Evidence` objects** (the shared `{type, path, line, signal, confidence}` shape from `@aker-build/project-map`, reused across gates/queue/prompts/reviewer). It **observes only** — it never judges, never imports gate logic. The assembled `ProjectMap` gains a new optional `data_access: Evidence[]` field carrying these sites. Gate G4 is **not** modified in this slice (that is a later task, gated by its own spec); this slice ends at "the evidence is produced, validated, and tested."

> **Evidence contract (all P1 detectors).** This detector and its four siblings (routes, migrations, auth, config-surface) all emit `Evidence[]` — never a custom struct. Tenant-scoping is expressed in the `signal` string: a query with no tenant filter emits `signal: "no_tenant_filter"`; one scoped by a tenant token emits `signal: "tenant_scoped"`. `confidence` is `"high"` for a structural match. `type` is `"line"` for a line-precise site.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest, Zod (via `@aker-build/project-map` schema). pnpm workspace.

## Global Constraints

- Detectors are **read-only and evidence-emitting only**. No judgment in a detector; no `import` of any `@aker-build/gates` symbol. (Constitution: control plane, not actor.)
- **Never capture or store a secret value**; evidence carries `path` + `line` + a signal label only. (FR-012 / FR-009 precedent in `secrets.ts`.)
- **Honesty default:** when no evidence is found, emit an empty array — never fabricate a site. (Mirrors `assemble.ts` `not_detected` discipline.)
- **Determinism:** output sorted by `path` then `line`, stable across runs. (R3 precedent in `detectRepos`/`detectStack`.)
- ESM imports use the `.js` specifier even for `.ts` sources (e.g. `import { readFileSafe } from "../io.js"`).
- Do **not** modify any artifact schema's public `version` constant. The new map field is **additive and optional** so existing `project-map.json` files still validate. (013 stop-condition: "Stop if enforcing requires changing existing artifact schemas" — additive optional fields do not break consumers.)
- Tests use `@pytest`-equivalent Vitest. Run a single package's tests with `pnpm --filter @aker-build/scanner test`.
- Never `git add -A` / `git add .`. Stage named files only.
- Do not commit unless this plan's commit step is reached AND the working tree has no unrelated changes; if unrelated changes exist, STOP and report (constitution Required-Behavior-Before-Edits).

---

### Task 1: Pin the data-access evidence vocabulary (reuse normative `Evidence`)

**Files:**
- Test: `packages/scanner/tests/data-access.test.ts` (created here, expanded in later tasks)

**Interfaces:**
- Consumes: the normative `Evidence` type from `@aker-build/project-map` — `{ type, path, line?, signal, confidence }`. No new type is defined; the detector reuses the shared shape.
- Produces (vocabulary): a query with no tenant filter emits `{ type: "line", signal: "no_tenant_filter", confidence: "high" }`; a tenant-scoped query emits `signal: "tenant_scoped"`. Later tasks (`detectDataAccess`, `assemble`) consume `Evidence[]`.

> **Reconciliation note:** an earlier draft defined a custom `DataAccessSite` struct. That is replaced by the normative `Evidence` shape so the whole pipeline (gates/queue/prompts/reviewer) speaks one vocabulary. Tenant-scoping lives in `signal`, not a boolean field.

- [ ] **Step 1: Write the failing test**

```typescript
// packages/scanner/tests/data-access.test.ts
import { describe, it, expect } from "vitest";
import type { Evidence } from "@aker-build/project-map";

describe("data-access evidence vocabulary", () => {
  it("uses the normative Evidence shape with signal-encoded tenant scoping", () => {
    const ev: Evidence = {
      type: "line",
      path: "apps/api/users.ts",
      line: 12,
      signal: "no_tenant_filter",
      confidence: "high",
    };
    expect(ev.signal).toBe("no_tenant_filter");
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/data-access.test.ts`
Expected: PASS — `Evidence` is already exported from `@aker-build/project-map`. (No type to add; this task only fixes the test vocabulary and confirms the shared type is importable from the scanner package. If the import fails, add `@aker-build/project-map` to `packages/scanner/package.json` dependencies — it is already a dependency via `assemble.ts`, so this should pass as-is.)

- [ ] **Step 3: Commit**

```bash
git add packages/scanner/tests/data-access.test.ts
git commit -m "test(scanner): pin data-access evidence to normative Evidence shape"
```

---

### Task 2: Implement `detectDataAccess` — query-site detection

**Files:**
- Create: `packages/scanner/src/detect/data-access.ts`
- Test: `packages/scanner/tests/data-access.test.ts` (expand)

**Interfaces:**
- Consumes: `Evidence` from `@aker-build/project-map`; `readFileSafe(root, rel)` from `../io.js` (returns `string | null`).
- Produces: `detectDataAccess(root: string, files: string[]): Evidence[]` — one Evidence per matched query line, sorted by `path` then `line`. Consumed by `assemble` (Task 3).

- [ ] **Step 1: Write the failing tests**

Append to `packages/scanner/tests/data-access.test.ts`:

```typescript
import { detectDataAccess } from "../src/detect/data-access.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tg-da-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("detectDataAccess", () => {
  it("flags an ORM query with no tenant filter as signal no_tenant_filter", () => {
    const root = fixture({
      "users.ts": `export const all = () => db.user.findMany({ where: { active: true } });\n`,
    });
    const ev = detectDataAccess(root, ["users.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      type: "line",
      path: "users.ts",
      line: 1,
      signal: "no_tenant_filter",
      confidence: "high",
    });
  });

  it("marks a query carrying a tenant_id token as signal tenant_scoped", () => {
    const root = fixture({
      "users.ts": `export const mine = (t) => db.user.findMany({ where: { tenant_id: t } });\n`,
    });
    const ev = detectDataAccess(root, ["users.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0].signal).toBe("tenant_scoped");
  });

  it("returns an empty array when there are no query sites (honesty default)", () => {
    const root = fixture({ "util.ts": `export const add = (a, b) => a + b;\n` });
    expect(detectDataAccess(root, ["util.ts"])).toEqual([]);
  });

  it("is deterministic: sorted by path then line", () => {
    const root = fixture({
      "b.ts": `db.order.findMany();\n`,
      "a.ts": `db.user.findMany();\ndb.user.findFirst();\n`,
    });
    const ev = detectDataAccess(root, ["b.ts", "a.ts"]);
    expect(ev.map((e) => `${e.path}:${e.line}`)).toEqual(["a.ts:1", "a.ts:2", "b.ts:1"]);
  });

  it("skips non-source files and unreadable paths without throwing", () => {
    const root = fixture({ "data.json": `{"db.user.findMany": true}\n` });
    expect(detectDataAccess(root, ["data.json", "missing.ts"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/data-access.test.ts`
Expected: FAIL — cannot import `detectDataAccess` from `../src/detect/data-access.js`.

- [ ] **Step 3: Implement the detector**

Create `packages/scanner/src/detect/data-access.ts`:

```typescript
import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

// Only inspect source files that plausibly contain query code.
const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;

// ORM / query-builder call shapes (Prisma/TypeORM/Knex/Sequelize-style) and raw SQL.
const QUERY_PATTERNS: RegExp[] = [
  /\b(find|findMany|findFirst|findUnique|findOne)\s*\(/,
  /\b(select|update|delete|insert)\s*\(/i,
  /\b(SELECT|UPDATE|DELETE|INSERT)\b[\s\S]{0,80}\bFROM\b|\bUPDATE\b\s+\w+\s+\bSET\b/i,
];

// A tenant-id token scoping the statement. Conservative: token must appear on the same line.
const TENANT_TOKEN = /\btenant_?id\b|\borg_?id\b|\baccount_?id\b/i;

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
      const text = lines[i];
      if (!QUERY_PATTERNS.some((re) => re.test(text))) continue;
      out.push({
        type: "line",
        path: rel,
        line: i + 1,
        signal: TENANT_TOKEN.test(text) ? "tenant_scoped" : "no_tenant_filter",
        confidence: "high",
      });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/data-access.test.ts`
Expected: PASS (all 6 tests in the file).

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/detect/data-access.ts packages/scanner/tests/data-access.test.ts
git commit -m "feat(scanner): add read-only data-access query-site detector"
```

---

### Task 3: Wire `data_access` evidence into the assembled ProjectMap

**Files:**
- Modify: `packages/project-map/src/schema.ts` (add optional `data_access` field reusing `evidenceSchema`).
- Modify: `packages/scanner/src/assemble.ts`
- Test: `packages/scanner/tests/data-access.test.ts` (expand with an assemble-level test)

**Interfaces:**
- Consumes: `detectDataAccess` (Task 2); `assemble(root, listFiles)` existing signature.
- Produces: `ProjectMap.data_access?: Evidence[]` — an **optional, additive** field reusing `evidenceSchema`. Absence ≡ not produced (back-compat). Later gate work (separate spec) consumes `map.data_access`.

- [ ] **Step 1: Write the failing assemble test**

Append to `packages/scanner/tests/data-access.test.ts`:

```typescript
import { assemble } from "../src/assemble.js";
import { listFiles } from "../src/index.js";

describe("assemble integrates data_access evidence", () => {
  it("populates map.data_access from detected query sites", () => {
    const root = fixture({
      "package.json": `{"name":"x"}`,
      "api/users.ts": `db.user.findMany({ where: { tenant_id: t } });\n`,
    });
    const { map } = assemble(root, listFiles);
    expect(map.data_access).toEqual([
      { type: "line", path: "api/users.ts", line: 1, signal: "tenant_scoped", confidence: "high" },
    ]);
  });

  it("omits or empties data_access when there are no query sites", () => {
    const root = fixture({ "package.json": `{"name":"x"}`, "readme.md": `hi\n` });
    const { map } = assemble(root, listFiles);
    expect(map.data_access ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/data-access.test.ts`
Expected: FAIL — `map.data_access` is `undefined` (field not assembled / not in schema).

- [ ] **Step 3: Add the optional field to the schema**

In `packages/project-map/src/schema.ts`, add to the `projectMapSchema` object (line ~100, after `critical_surfaces`). **Reuse the existing `evidenceSchema`** — do not define a new shape:

```typescript
    critical_surfaces: z.array(z.string()),
    data_access: z.array(evidenceSchema).optional(),
```

`evidenceSchema` is already declared above in the same file (line ~11) and `Evidence` is already exported (line ~105). No new type is needed; `ProjectMap.data_access?: Evidence[]` falls out of `z.infer` automatically because of the `.passthrough()` object.

- [ ] **Step 4: Populate the field in `assemble`**

In `packages/scanner/src/assemble.ts`:

Add the import near the other detect imports (line ~4):

```typescript
import { detectDataAccess } from "./detect/data-access.js";
```

After `const { repos } = detectRepos(root, listFiles);` (line ~27), add:

```typescript
  const data_access = detectDataAccess(root, files);
```

Add `data_access` to the `map` object literal (after `critical_surfaces`, line ~57):

```typescript
    critical_surfaces,
    data_access,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/data-access.test.ts`
Expected: PASS (all 8 tests).

- [ ] **Step 6: Run the full scanner + project-map suites (no regressions)**

Run: `pnpm --filter @aker-build/scanner test && pnpm --filter @aker-build/project-map test`
Expected: PASS. (Confirms the additive optional field broke no existing map fixtures.)

- [ ] **Step 7: Commit**

```bash
git add packages/scanner/src/assemble.ts packages/scanner/tests/data-access.test.ts packages/project-map/src
git commit -m "feat(scanner): surface data_access evidence in project map (additive, optional)"
```

---

### Task 4: Verify full workspace build & typecheck

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: PASS across all packages.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS — `data_access` typed end-to-end (detector → assemble → map type).

- [ ] **Step 3: Confirm no gate file was touched**

Run: `git diff --name-only HEAD~3 HEAD`
Expected: only `packages/scanner/**` and `packages/project-map/**` files. No `packages/gates/**`. (This slice produces evidence only; G4 consumption is a separate, later spec.)

---

## Self-Review

**1. Spec coverage (against the roadmap P1 section):**
- "new read-only evidence detector `data-access` feeding G4" → Task 2 produces the evidence; Task 3 surfaces it on the map for G4 to consume later. The G4 *consumption* is explicitly deferred (roadmap says each detector ships its own spec→plan→tasks cycle), and Task 4 Step 3 asserts no gate file changed — consistent with scope. ✓
- "observes only; never judges; never imports gate logic" → Global Constraints + detector contains zero gate imports; the `signal` value is a fact, not a verdict. ✓
- "independently testable given a fixture repo" → every task is fixture-driven Vitest. ✓
- "matches existing repos/secrets/stack pattern, ~200 lines" → `data-access.ts` mirrors `secrets.ts` structure and is well under 200 lines. ✓
- "all P1 detectors emit the normative `Evidence` shape" → Task 1 pins the vocabulary; Task 2 returns `Evidence[]`; Task 3 reuses `evidenceSchema`. ✓

**2. Placeholder scan:** No TBD/TODO. All file paths and line anchors are exact (`packages/project-map/src/schema.ts`, `evidenceSchema` line ~11, `projectMapSchema` line ~100) — verified against the actual file this session. ✓

**3. Type consistency:** The normative `Evidence` shape `{ type, path, line?, signal, confidence }` (from `@aker-build/project-map`) is used identically in Task 1 (vocabulary test), Task 2 (detector return + tests), and Task 3 (schema `z.array(evidenceSchema)` + assemble + tests). No custom `DataAccessSite` type is introduced. `detectDataAccess(root, files): Evidence[]` signature is identical where defined (Task 2) and consumed (Task 3). Tenant-scoping is encoded in `signal` (`"tenant_scoped"` / `"no_tenant_filter"`) everywhere — never a boolean. ✓

**Note on a known weakness this slice intentionally does NOT fix:** G4's current file-level false-positive logic (`packages/gates/src/gates/g4-security.ts:27` flags all routes when one auth token is absent) is real but out of scope here — it belongs to the G4-consumption spec that follows this detector. Flagged so the next planner picks it up.
