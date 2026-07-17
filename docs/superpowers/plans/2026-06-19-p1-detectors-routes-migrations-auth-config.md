# P1 Detectors — routes, migrations, auth, config-surface — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the remaining four read-only P1 evidence detectors — `routes`, `migrations`, `auth`, `config-surface` — each emitting normative `Evidence[]` into its own additive, optional Project Map field, feeding the starved gates (G2/G3/G4/G6/G7).

**Architecture:** Each detector is a pure function under `packages/scanner/src/detect/`, mirroring `secrets.ts` / `data-access.ts`: `(root, files) => Evidence[]`. It reads via `readFileSafe`, emits the shared `Evidence` shape, observes only, never judges, never imports gate logic. Each adds one optional field to `projectMapSchema` and is wired into `assemble.ts`. **G-gate consumption is out of scope** — this plan ends when evidence is produced, validated, and tested.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Vitest, Zod (via `@aker-build/project-map`). pnpm workspace.

## Global Constraints

- **Evidence contract (binding for all four detectors):** emit only the normative `Evidence` shape from `@aker-build/project-map` — `{ type: "line", path, line, signal, confidence }`. Never a custom struct. The *finding kind* lives in `signal` (a short snake_case label); `confidence` is `"high"` for a structural match, `"medium"` for a heuristic/name-based match. See [[p1-evidence-contract]].
- Detectors are **read-only and evidence-emitting only**. No judgment; no `import` of any `@aker-build/gates` symbol. (Constitution: control plane, not actor.)
- **Never capture or store a secret/credential value** — evidence carries `path` + `line` + a signal label only (FR-012 / FR-009 precedent).
- **Honesty default:** no evidence → empty array. Never fabricate.
- **Determinism:** every detector returns `Evidence[]` sorted by `path` then `line`.
- **Additive optional fields only:** each new `projectMapSchema` field is `z.array(evidenceSchema).optional()`. The schema is `.passthrough()`, so existing `project-map.json` files keep validating. Do **not** bump `SCHEMA_VERSION`.
- ESM imports use the `.js` specifier even for `.ts` sources.
- Never `git add -A` / `git add .`. Stage named files only.
- These four detectors all register their field in the **same two files** (`packages/scanner/src/assemble.ts`, `packages/project-map/src/schema.ts`). When implemented in parallel, the integration edits to those two files MUST be serialized into a single step (the implementing workflow does this). Within this plan, Task 5 is that single integration task.

## Shared sort helper (used by every detector)

Every detector ends with this exact sort (copy verbatim — do not paraphrase):

```typescript
out.sort((a, b) =>
  a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
);
```

## Shared test fixture helper (used by every detector test)

Each test file opens with this helper (copy verbatim):

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tg-p1-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}
```

---

### Task 1: `routes` detector — API surface evidence (feeds G2, G4)

**Files:**
- Create: `packages/scanner/src/detect/routes.ts`
- Test: `packages/scanner/tests/routes.test.ts`

**Interfaces:**
- Consumes: `Evidence` from `@aker-build/project-map`; `readFileSafe` from `../io.js`.
- Produces: `detectRoutes(root: string, files: string[]): Evidence[]`. Signals: `route_definition` (a route handler), `route_admin` (path contains `/admin`). Consumed by `assemble` (Task 5).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/scanner/tests/routes.test.ts
// (open with the shared fixture helper above)
import { detectRoutes } from "../src/detect/routes.js";

describe("detectRoutes", () => {
  it("emits route_definition evidence for an Express-style route", () => {
    const root = fixture({ "api.ts": `app.get("/users", handler);\n` });
    const ev = detectRoutes(root, ["api.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ type: "line", path: "api.ts", line: 1, signal: "route_definition", confidence: "high" });
  });

  it("emits an additional route_admin signal for an admin path", () => {
    const root = fixture({ "api.ts": `router.post("/admin/users", handler);\n` });
    const ev = detectRoutes(root, ["api.ts"]);
    expect(ev.map((e) => e.signal).sort()).toEqual(["route_admin", "route_definition"]);
  });

  it("returns empty for files with no routes (honesty)", () => {
    const root = fixture({ "util.ts": `export const x = 1;\n` });
    expect(detectRoutes(root, ["util.ts"])).toEqual([]);
  });

  it("is deterministic: sorted by path then line", () => {
    const root = fixture({ "b.ts": `app.get("/a", h);\n`, "a.ts": `app.get("/b", h);\n` });
    const ev = detectRoutes(root, ["b.ts", "a.ts"]);
    expect(ev.map((e) => e.path)).toEqual(["a.ts", "b.ts"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/routes.test.ts`
Expected: FAIL — cannot import `detectRoutes`.

- [ ] **Step 3: Implement the detector**

```typescript
// packages/scanner/src/detect/routes.ts
import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;
const ROUTE_DEF = /\b(app|router|server)\.(get|post|put|patch|delete)\s*\(/i;
const ADMIN_PATH = /['"`]\/?admin(\/|['"`])/i;

/**
 * Detect API route definitions as Evidence. Read-only: one route_definition per matched line, plus
 * a route_admin signal when the line targets an /admin path. Never judges (a missing auth guard is
 * G4's call, not this detector's). Sorted by path then line. Honesty: no routes -> empty array.
 */
export function detectRoutes(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (!ROUTE_DEF.test(text)) continue;
      out.push({ type: "line", path: rel, line: i + 1, signal: "route_definition", confidence: "high" });
      if (ADMIN_PATH.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "route_admin", confidence: "high" });
      }
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/routes.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/detect/routes.ts packages/scanner/tests/routes.test.ts
git commit -m "feat(scanner): add read-only routes detector"
```

---

### Task 2: `migrations` detector — migration safety evidence (feeds G3)

**Files:**
- Create: `packages/scanner/src/detect/migrations.ts`
- Test: `packages/scanner/tests/migrations.test.ts`

**Interfaces:**
- Consumes: `Evidence`; `readFileSafe`.
- Produces: `detectMigrations(root: string, files: string[]): Evidence[]`. Signals: `destructive_migration` (DROP/ALTER ... DROP/TRUNCATE in a migration file), `migration_present` (a migration file with no destructive op). Consumed by `assemble` (Task 5).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/scanner/tests/migrations.test.ts
// (open with the shared fixture helper above)
import { detectMigrations } from "../src/detect/migrations.js";

describe("detectMigrations", () => {
  it("flags a destructive DROP TABLE in a migration file", () => {
    const root = fixture({ "migrations/001_init.sql": `DROP TABLE users;\n` });
    const ev = detectMigrations(root, ["migrations/001_init.sql"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ signal: "destructive_migration", confidence: "high", line: 1 });
  });

  it("emits migration_present for a non-destructive migration", () => {
    const root = fixture({ "migrations/002_add.sql": `CREATE TABLE orders (id int);\n` });
    const ev = detectMigrations(root, ["migrations/002_add.sql"]);
    expect(ev.map((e) => e.signal)).toEqual(["migration_present"]);
  });

  it("ignores DROP outside a migration directory (scope)", () => {
    const root = fixture({ "src/util.ts": `const q = "DROP TABLE users";\n` });
    expect(detectMigrations(root, ["src/util.ts"])).toEqual([]);
  });

  it("returns empty when there are no migration files (honesty)", () => {
    const root = fixture({ "readme.md": `hi\n` });
    expect(detectMigrations(root, ["readme.md"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/migrations.test.ts`
Expected: FAIL — cannot import `detectMigrations`.

- [ ] **Step 3: Implement the detector**

```typescript
// packages/scanner/src/detect/migrations.ts
import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

// A migration file: lives under a migrations dir, or is a .sql file with a numeric prefix.
const MIGRATION_PATH = /(^|\/)migrations?\//i;
const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE|ALTER\s+TABLE\s+\w+\s+DROP)\b/i;

/**
 * Detect migration safety evidence. Read-only: within migration files only, flag destructive ops
 * (destructive_migration) line-by-line; if a migration file has none, emit one migration_present at
 * line 1. Reversibility judgment is G3's call, not this detector's. Sorted by path then line.
 */
export function detectMigrations(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!MIGRATION_PATH.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    let destructiveFound = false;
    for (let i = 0; i < lines.length; i++) {
      if (DESTRUCTIVE.test(lines[i])) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "destructive_migration", confidence: "high" });
        destructiveFound = true;
      }
    }
    if (!destructiveFound) {
      out.push({ type: "line", path: rel, line: 1, signal: "migration_present", confidence: "high" });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/migrations.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/detect/migrations.ts packages/scanner/tests/migrations.test.ts
git commit -m "feat(scanner): add read-only migrations detector"
```

---

### Task 3: `auth` detector — auth boundary evidence (feeds G4)

**Files:**
- Create: `packages/scanner/src/detect/auth.ts`
- Test: `packages/scanner/tests/auth.test.ts`

**Interfaces:**
- Consumes: `Evidence`; `readFileSafe`.
- Produces: `detectAuth(root: string, files: string[]): Evidence[]`. Signals: `auth_guard` (an auth/authn middleware or guard call), `role_guard` (an RBAC/role check). Consumed by `assemble` (Task 5).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/scanner/tests/auth.test.ts
// (open with the shared fixture helper above)
import { detectAuth } from "../src/detect/auth.js";

describe("detectAuth", () => {
  it("emits auth_guard evidence for an authenticate middleware", () => {
    const root = fixture({ "mw.ts": `app.use(requireAuth());\n` });
    const ev = detectAuth(root, ["mw.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ signal: "auth_guard", confidence: "high", line: 1 });
  });

  it("emits role_guard evidence for an RBAC check", () => {
    const root = fixture({ "mw.ts": `if (requireRole("admin")) {}\n` });
    const ev = detectAuth(root, ["mw.ts"]);
    expect(ev.map((e) => e.signal)).toEqual(["role_guard"]);
  });

  it("returns empty when no auth constructs are present (honesty)", () => {
    const root = fixture({ "util.ts": `export const x = 1;\n` });
    expect(detectAuth(root, ["util.ts"])).toEqual([]);
  });

  it("is deterministic: sorted by path then line", () => {
    const root = fixture({ "b.ts": `requireAuth();\n`, "a.ts": `authenticate();\n` });
    const ev = detectAuth(root, ["b.ts", "a.ts"]);
    expect(ev.map((e) => e.path)).toEqual(["a.ts", "b.ts"]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/auth.test.ts`
Expected: FAIL — cannot import `detectAuth`.

- [ ] **Step 3: Implement the detector**

```typescript
// packages/scanner/src/detect/auth.ts
import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;
const AUTH_GUARD = /\b(requireAuth|authenticate|isAuthenticated|authGuard|ensureAuth|withAuth|verifyToken)\b/;
const ROLE_GUARD = /\b(requireRole|isAdmin|adminOnly|hasRole|checkRole|authorize)\b/;

/**
 * Detect auth boundary evidence. Read-only: records WHERE auth/role guards exist (auth_guard,
 * role_guard). Whether a given route LACKS one is G4's correlation to make, not this detector's.
 * Sorted by path then line. Honesty: none -> empty array.
 */
export function detectAuth(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      if (ROLE_GUARD.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "role_guard", confidence: "high" });
      } else if (AUTH_GUARD.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "auth_guard", confidence: "high" });
      }
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/auth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/detect/auth.ts packages/scanner/tests/auth.test.ts
git commit -m "feat(scanner): add read-only auth detector"
```

---

### Task 4: `config-surface` detector — billing/observability evidence (feeds G6, G7)

**Files:**
- Create: `packages/scanner/src/detect/config-surface.ts`
- Test: `packages/scanner/tests/config-surface.test.ts`

**Interfaces:**
- Consumes: `Evidence`; `readFileSafe`.
- Produces: `detectConfigSurface(root: string, files: string[]): Evidence[]`. Signals: `env_var_use` (`process.env.X` access — `medium` confidence), `billing_hook` (a billing/usage call — `medium`), `log_emit` (a log/metric emission — `medium`). Never captures the env var's value. Consumed by `assemble` (Task 5).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/scanner/tests/config-surface.test.ts
// (open with the shared fixture helper above)
import { detectConfigSurface } from "../src/detect/config-surface.js";

describe("detectConfigSurface", () => {
  it("emits env_var_use without capturing the value", () => {
    const root = fixture({ "cfg.ts": `const k = process.env.STRIPE_KEY;\n` });
    const ev = detectConfigSurface(root, ["cfg.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ signal: "env_var_use", confidence: "medium", line: 1 });
    // value/name is never copied into the evidence
    expect(JSON.stringify(ev)).not.toContain("STRIPE_KEY");
  });

  it("emits billing_hook for a billing/usage call", () => {
    const root = fixture({ "pay.ts": `stripe.subscriptions.create(opts);\n` });
    const ev = detectConfigSurface(root, ["pay.ts"]);
    expect(ev.map((e) => e.signal)).toContain("billing_hook");
  });

  it("emits log_emit for a logger call", () => {
    const root = fixture({ "svc.ts": `logger.info("started");\n` });
    const ev = detectConfigSurface(root, ["svc.ts"]);
    expect(ev.map((e) => e.signal)).toContain("log_emit");
  });

  it("returns empty when nothing matches (honesty)", () => {
    const root = fixture({ "util.ts": `export const add = (a, b) => a + b;\n` });
    expect(detectConfigSurface(root, ["util.ts"])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/config-surface.test.ts`
Expected: FAIL — cannot import `detectConfigSurface`.

- [ ] **Step 3: Implement the detector**

```typescript
// packages/scanner/src/detect/config-surface.ts
import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;
// Ordered: first match per line wins, so a line is one signal.
const SURFACE_PATTERNS: { re: RegExp; signal: string }[] = [
  { re: /\bprocess\.env\.\w+/, signal: "env_var_use" },
  { re: /\b(stripe|paddle|chargebee)\.[\w.]*\b|\b(charge|invoice|subscription|usageRecord)s?\b/i, signal: "billing_hook" },
  { re: /\b(logger|log|metrics|tracer)\.\w+\s*\(|\bconsole\.(log|info|warn|error)\s*\(/, signal: "log_emit" },
];

/**
 * Detect config/billing/observability surface as Evidence (medium confidence — these are
 * heuristic name-based signals). Read-only: env_var_use, billing_hook, log_emit. NEVER copies the
 * env var name or value into the evidence. Sorted by path then line. Honesty: none -> empty array.
 */
export function detectConfigSurface(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i];
      const matched = SURFACE_PATTERNS.find((p) => p.re.test(text));
      if (!matched) continue;
      out.push({ type: "line", path: rel, line: i + 1, signal: matched.signal, confidence: "medium" });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/config-surface.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/scanner/src/detect/config-surface.ts packages/scanner/tests/config-surface.test.ts
git commit -m "feat(scanner): add read-only config-surface detector"
```

---

### Task 5: Integration — register all four fields in the schema + assemble (SERIAL)

This is the single serialization point. It edits the two shared files **once**, after all four detectors exist.

**Files:**
- Modify: `packages/project-map/src/schema.ts`
- Modify: `packages/scanner/src/assemble.ts`
- Test: `packages/scanner/tests/p1-integration.test.ts` (create)

**Interfaces:**
- Consumes: `detectRoutes`, `detectMigrations`, `detectAuth`, `detectConfigSurface` (Tasks 1–4); `evidenceSchema` (already in `schema.ts`).
- Produces: optional map fields `routes?`, `migrations?`, `auth?`, `config_surface?` — each `Evidence[]`.

- [ ] **Step 1: Write the failing integration test**

```typescript
// packages/scanner/tests/p1-integration.test.ts
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assemble } from "../src/assemble.js";
import { listFiles } from "../src/index.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "tg-p1i-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("assemble surfaces all four P1 detector fields", () => {
  it("populates routes, migrations, auth, config_surface from a representative repo", () => {
    const root = fixture({
      "package.json": `{"name":"x"}`,
      "api/routes.ts": `app.get("/admin/x", requireRole("a"));\n`,
      "migrations/001.sql": `DROP TABLE old;\n`,
      "cfg.ts": `const k = process.env.K;\n`,
    });
    const { map } = assemble(root, listFiles);
    expect(map.routes?.some((e) => e.signal === "route_definition")).toBe(true);
    expect(map.migrations?.some((e) => e.signal === "destructive_migration")).toBe(true);
    expect(map.auth?.some((e) => e.signal === "role_guard")).toBe(true);
    expect(map.config_surface?.some((e) => e.signal === "env_var_use")).toBe(true);
  });

  it("omits/empties all four fields for a repo with none of these surfaces", () => {
    const root = fixture({ "package.json": `{"name":"x"}`, "readme.md": `hi\n` });
    const { map } = assemble(root, listFiles);
    expect(map.routes ?? []).toEqual([]);
    expect(map.migrations ?? []).toEqual([]);
    expect(map.auth ?? []).toEqual([]);
    expect(map.config_surface ?? []).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/p1-integration.test.ts`
Expected: FAIL — fields are `undefined`.

- [ ] **Step 3: Add the four optional fields to the schema**

In `packages/project-map/src/schema.ts`, in `projectMapSchema` (after `critical_surfaces`, and after the `data_access` line if the data-access plan already added it):

```typescript
    routes: z.array(evidenceSchema).optional(),
    migrations: z.array(evidenceSchema).optional(),
    auth: z.array(evidenceSchema).optional(),
    config_surface: z.array(evidenceSchema).optional(),
```

- [ ] **Step 4: Wire the four detectors into `assemble`**

In `packages/scanner/src/assemble.ts`, add imports near the other detect imports:

```typescript
import { detectRoutes } from "./detect/routes.js";
import { detectMigrations } from "./detect/migrations.js";
import { detectAuth } from "./detect/auth.js";
import { detectConfigSurface } from "./detect/config-surface.js";
```

After `const files = listFiles(root);` compute the evidence:

```typescript
  const routes = detectRoutes(root, files);
  const migrations = detectMigrations(root, files);
  const auth = detectAuth(root, files);
  const config_surface = detectConfigSurface(root, files);
```

Add them to the `map` object literal (after `critical_surfaces`, alongside `data_access` if present):

```typescript
    routes,
    migrations,
    auth,
    config_surface,
```

- [ ] **Step 5: Run the integration test + full scanner/project-map suites**

Run: `pnpm --filter @aker-build/scanner exec vitest run tests/p1-integration.test.ts && pnpm --filter @aker-build/scanner test && pnpm --filter @aker-build/project-map test`
Expected: PASS. Existing map fixtures still validate (additive optional fields).

- [ ] **Step 6: Commit**

```bash
git add packages/project-map/src/schema.ts packages/scanner/src/assemble.ts packages/scanner/tests/p1-integration.test.ts
git commit -m "feat(scanner): surface routes/migrations/auth/config-surface evidence in project map"
```

---

### Task 6: Full workspace verification

**Files:** none (verification only).

- [ ] **Step 1: Full suite**

Run: `pnpm test`
Expected: PASS across all packages.

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — all four fields typed end-to-end as `Evidence[]`.

- [ ] **Step 3: No gate file touched**

Run: `git diff --name-only main HEAD`
Expected: only `packages/scanner/**` and `packages/project-map/**` (plus the plan docs). No `packages/gates/**`. Evidence only; gate consumption is a later spec.

---

## Self-Review

**1. Spec coverage (roadmap P1 detector table):**
- `routes` (feeds G2, G4) → Task 1. ✓
- `data-access` (feeds G4, G5) → covered by the sibling plan `2026-06-19-p1-data-access-detector.md`. ✓ (not duplicated here)
- `migrations` (feeds G3) → Task 2. ✓
- `auth` (feeds G4) → Task 3. ✓
- `config-surface` (feeds G6, G7) → Task 4. ✓
- "observes only; never imports gate logic; ~200 lines each" → every detector is a single pure function, zero gate imports, well under 200 lines. ✓
- "integration serialized at one point" → Task 5 is the sole editor of `schema.ts` + `assemble.ts`. ✓

**2. Placeholder scan:** No TBD/TODO. All file paths exact; the shared sort/fixture helpers are given verbatim once and referenced, not vaguely described. ✓

**3. Type/consistency:** Every detector signature is `(root: string, files: string[]) => Evidence[]`. Every emitted object is the normative `Evidence` (`type`/`path`/`line`/`signal`/`confidence`). Field names in Task 5 schema (`routes`, `migrations`, `auth`, `config_surface`) match the assemble keys and the integration test assertions exactly. `config_surface` uses an underscore (snake_case) consistently in schema, assemble, and tests. ✓

**Known weaknesses intentionally deferred (for the next planner):**
- The `auth` and `routes` detectors emit *presence* evidence; the *correlation* "this route has no guard" is G4's job — deliberately not done here (would be judgment).
- `config-surface` signals are `medium` confidence (heuristic/name-based) — P2's calibration work will tune these; this plan just emits them honestly tiered.
