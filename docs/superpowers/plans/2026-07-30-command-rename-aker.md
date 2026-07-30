# Command Rename to `aker` Implementation Plan (Spec 021)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the user-typed command from `aker-build` to `aker` across the live surface, leaving the distribution name, internal package scope, and output artifact names unchanged.

**Architecture:** Four things share the string `aker-build`; only two change. The bin declaration and bundle filename move together (a validator couples them), and user-facing error text moves with them because it tells users what to type. A new test pins that error text, since nothing currently does. Historical records are left intact.

**Tech Stack:** TypeScript 5.7, Node.js 22.13+, pnpm 11, Vitest 2, Node built-in test runner.

## Global Constraints

- Read `docs/superpowers/specs/2026-07-30-command-rename-aker-design.md` first; it is the authority for scope.
- **Do NOT rename `@aker-build/*` package scope.** Verified at exactly 195 references. Renaming it is the broad refactor `CLAUDE.md` forbids.
- **Do NOT rename output artifacts:** the `.aker-build/` directory, `aker-build-report.json`, `aker-build-report.md`. They are referenced by `contracts/report.schema.json` and both smoke scripts.
- **Do NOT rewrite historical records** in `specs/`, `docs/decisions/`, `docs/roadmap/`, or `docs/superpowers/specs|plans` other than files this plan names.
- The npm and PyPI distribution name stays `aker-build`. Only the command becomes `aker`.
- No backward-compatible `aker-build` alias. Nothing is published, so there is nothing to be compatible with.
- Do not commit, push, publish, or open a PR unless the operator explicitly requests it.
- Never use `git add -A` or `git add .`; stage named files only.
- Do not modify `pnpm-lock.yaml`. If `pnpm install` or `pnpm test` dirties it, `git checkout pnpm-lock.yaml`.
- Commit signing is disabled for this work by operator authorization (`git -c commit.gpgsign=false`).

## File Structure

| Path | Change |
|---|---|
| `packages/queue/tests/error-guidance.test.ts` | **New.** Pins the error text that tells users what to run. |
| `packages/cli/package.json:30` | `bin` key → `aker` |
| `scripts/build-cli-package.mjs` (:47, :59, :72, :73) | Bundle outfile + manifest `bin`/`files` → `aker.js` |
| `scripts/cli-package.mjs` (:2, :42, :43) | Validator expectations → `aker` / `dist/aker.js` |
| `scripts/cli-package.test.mjs` (:16–22, :39, :50, :97) | Fixture manifest + packed-file list |
| `scripts/verify-cli-package.mjs:85` | Installed binary name → `aker` / `aker.cmd` |
| `packages/cli/src/commands/map.ts:25`, `packages/gates/src/context.ts:30`, `packages/prompt/src/io.ts:15`, `packages/queue/src/context.ts` (:32, :44), `packages/queue/src/index.ts:72`, `packages/review/src/io.ts:19`, `packages/mcp/src/ensure.ts:37` | Error/doc text → `` `aker <verb>` `` |
| 7 `describe()` labels under `packages/cli/tests/` | Cosmetic consistency |
| `README.md`, `packages/cli/README.md`, `CLAUDE.md` | Command examples |
| 6 wrappers + `SKILL.md` under `distribution/bundle-templates/claude/`, then regenerated `packages/plugin/dist/bundle-manifest.json` | Command examples; manifest baseline |
| `distribution/evals/aker-build-skill.json`, `distribution/evals/grade.test.mjs` | Expected-command strings |
| `scripts/rename-guard.mjs` + `scripts/rename-guard.test.mjs` | **New.** Standing assertions: no live `aker-build <verb>`, scope count still 195. |

Task 1 adds the missing guard first (so the rename is verifiable). Tasks 2–3 do code and release tooling. Task 4 does the plugin surface plus manifest regeneration. Task 5 does docs. Task 6 adds the standing grep/scope guard and runs full verification.

---

### Task 1: Pin the error guidance text

Nothing currently asserts these strings — the seven existing hits under
`packages/cli/tests/` are `describe()` labels. Without this test, a missed error
string leaves the tool telling users to run a command that does not exist while the
suite stays green.

**Files:**
- Create: `packages/queue/tests/error-guidance.test.ts`

**Interfaces:**
- Consumes: `deriveQueue`, `MissingProjectMapError`, `MissingRisksError` from `@aker-build/queue`; `fixtureRepo`, `minimalMap`, `riskList` from `./helpers.js`.
- Produces: nothing consumed by later tasks. This is a guard.

- [ ] **Step 1: Write the failing test**

Create `packages/queue/tests/error-guidance.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { deriveQueue, MissingProjectMapError, MissingRisksError } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList } from "./helpers.js";

/**
 * These messages are the only place the product tells a user what to type. If the
 * command is renamed and a message is missed, the tool sends people to a command that
 * does not exist -- and no other test would notice.
 */
describe("error guidance names the real command", () => {
  function emptyGitRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "aker-guidance-"));
    execFileSync("git", ["init", "--quiet"], { cwd: dir });
    return dir;
  }

  it("a missing project map tells the user to run `aker scan`", () => {
    const repoRoot = emptyGitRepo();
    try {
      expect(() => deriveQueue(repoRoot, { out: join(repoRoot, ".aker-build") })).toThrow(
        MissingProjectMapError,
      );
      try {
        deriveQueue(repoRoot, { out: join(repoRoot, ".aker-build") });
      } catch (err) {
        const message = (err as Error).message;
        expect(message).toContain("`aker scan`");
        expect(message).not.toContain("aker-build scan");
      }
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("a missing risks file tells the user to run `aker gates`", () => {
    const { repoRoot, outDir } = fixtureRepo(minimalMap(), riskList([]));
    rmSync(join(outDir, "risks.json"), { force: true });
    try {
      deriveQueue(repoRoot, { out: outDir });
      throw new Error("expected MissingRisksError");
    } catch (err) {
      expect(err).toBeInstanceOf(MissingRisksError);
      const message = (err as Error).message;
      expect(message).toContain("`aker gates`");
      expect(message).not.toContain("aker-build gates");
    }
  });

  it("no guidance string references the old command name", () => {
    // Guards every message at once, including ones added later.
    const sources = [
      "../src/context.ts",
      "../src/index.ts",
    ].map((rel) => new URL(rel, import.meta.url));
    for (const url of sources) {
      const text = readFileSyncUtf8(url);
      expect(text).not.toMatch(/`aker-build [a-z-]+`/);
    }
  });
});

function readFileSyncUtf8(url: URL): string {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("node:fs").readFileSync(url, "utf8") as string;
}
```

- [ ] **Step 2: Simplify the third test to avoid a require() in ESM**

Replace the third test and the helper with a static import form. Edit the file so the
top imports include `readFileSync` (already imported) and the third test reads:

```typescript
  it("no guidance string references the old command name", () => {
    // Guards every message at once, including ones added later.
    for (const rel of ["../src/context.ts", "../src/index.ts"]) {
      const text = readFileSync(new URL(rel, import.meta.url), "utf8");
      expect(text).not.toMatch(/`aker-build [a-z-]+`/);
    }
  });
```

Then delete the `readFileSyncUtf8` helper function entirely, and add `readFileSync` to
the existing `node:fs` import (it becomes
`import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";`).

- [ ] **Step 3: Run the test to verify it fails**

```bash
cd packages/queue && npx vitest run tests/error-guidance.test.ts
```

Expected: FAIL. The messages currently say `` `aker-build scan` ``, so
`toContain("`aker scan`")` fails and the regex test finds the old form.

- [ ] **Step 4: Commit the failing guard**

Committing a red test is deliberate here: it records that the guard existed before
the rename, so the next commit demonstrably turns it green.

```bash
git add packages/queue/tests/error-guidance.test.ts
git -c commit.gpgsign=false commit -m "test(queue): pin the error text that tells users what to run"
```

---

### Task 2: Rename the error guidance text

**Files:**
- Modify: `packages/queue/src/context.ts:32`, `packages/queue/src/context.ts:44`
- Modify: `packages/queue/src/index.ts:72`
- Modify: `packages/gates/src/context.ts:30`
- Modify: `packages/prompt/src/io.ts:15`
- Modify: `packages/review/src/io.ts:19`
- Modify: `packages/cli/src/commands/map.ts:25`
- Modify: `packages/mcp/src/ensure.ts:37`

**Interfaces:**
- Consumes: the guard from Task 1.
- Produces: error messages naming `aker <verb>`; Task 6's grep guard depends on these being complete.

- [ ] **Step 1: Replace each occurrence**

Each is a one-token change inside a template literal. Exact replacements:

`packages/queue/src/context.ts:32`
```typescript
    throw new MissingProjectMapError(`No produced map at ${mapPath}. Run \`aker scan\` first.`);
```

`packages/queue/src/context.ts:44`
```typescript
    throw new MissingRisksError(`No produced risks at ${risksPath}. Run \`aker gates\` first.`);
```

`packages/queue/src/index.ts:72`
```typescript
    throw new MissingQueueError(`No produced queue at ${queuePath}. Run \`aker queue\` first.`);
```

`packages/gates/src/context.ts:30`
```typescript
      `No produced map at ${mapPath}. Run \`aker scan\` first.`,
```

`packages/prompt/src/io.ts:15`
```typescript
    throw new MissingQueueError(`No produced queue at ${queuePath}. Run \`aker queue\` first.`);
```

`packages/review/src/io.ts:19`
```typescript
    throw new MissingQueueError(`No produced queue at ${queuePath}. Run \`aker queue\` first.`);
```

`packages/cli/src/commands/map.ts:25`
```typescript
    printErr(`No produced map at ${file}. Run \`aker scan\` first.`);
```

`packages/mcp/src/ensure.ts:37` (doc comment)
```typescript
 * and throw when they are missing (`route` throws MissingQueueError: "Run `aker queue`
```

- [ ] **Step 2: Run the guard to verify it passes**

```bash
cd packages/queue && npx vitest run tests/error-guidance.test.ts
```

Expected: PASS, 3 tests.

- [ ] **Step 3: Run every affected package's tests**

```bash
corepack pnpm --filter @aker-build/queue --filter @aker-build/gates --filter @aker-build/prompt --filter @aker-build/review --filter @aker-build/mcp --filter @aker-build/cli test
```

Expected: all pass. Any failure here means a test asserted the old string; update the
assertion, not the message.

- [ ] **Step 4: Commit**

```bash
git add packages/queue/src/context.ts packages/queue/src/index.ts packages/gates/src/context.ts packages/prompt/src/io.ts packages/review/src/io.ts packages/cli/src/commands/map.ts packages/mcp/src/ensure.ts
git -c commit.gpgsign=false commit -m "fix: point error guidance at the aker command"
```

---

### Task 3: Rename the bin and bundle filename

`scripts/cli-package.mjs` validates the bin target and the packed file list, so the
validator and its fixtures move in lockstep. That coupling is why a half-applied
rename cannot reach the release path.

**Files:**
- Modify: `packages/cli/package.json:30`
- Modify: `scripts/build-cli-package.mjs` (:47, :59, :72, :73)
- Modify: `scripts/cli-package.mjs` (:2, :42, :43)
- Modify: `scripts/cli-package.test.mjs` (:21, :22, :39, :50, :97)
- Modify: `scripts/verify-cli-package.mjs:85`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: a published bin named `aker` targeting `dist/aker.js`. Spec 020's wheel vendors this filename.

- [ ] **Step 1: Update the workspace bin**

`packages/cli/package.json:30` — the key changes, the target does not:

```json
    "aker": "./src/bin.ts"
```

- [ ] **Step 2: Update the generator**

In `scripts/build-cli-package.mjs`:

```javascript
    outfile: join(output, "dist", "aker.js"),
```

```javascript
  const executablePath = join(output, "dist", "aker.js");
```

```javascript
    bin: { aker: "dist/aker.js" },
    files: ["dist/aker.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"],
```

Leave `name: "aker-build"` unchanged — that is the distribution name.

- [ ] **Step 3: Update the validator**

In `scripts/cli-package.mjs`, line 2 of `REQUIRED_PACKAGE_FILES`:

```javascript
  "dist/aker.js",
```

and the bin rule:

```javascript
    holds: (m) => m.bin?.aker === "dist/aker.js",
    message: "aker bin must target dist/aker.js",
```

Leave the `m.name === "aker-build"` rule unchanged.

- [ ] **Step 4: Update the validator's fixtures**

In `scripts/cli-package.test.mjs`, keep `name: "aker-build"` and change:

```javascript
  bin: { aker: "dist/aker.js" },
  files: ["dist/aker.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"],
```

the negative case at :39:

```javascript
  ["wrong bin", (manifest) => { manifest.bin = { aker: "src/bin.ts" }; }],
```

the packed list at :50:

```javascript
const packed = ["package.json", "dist/aker.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"];
```

and the executable path at :97:

```javascript
  const executablePath = join(packageDir, "dist", "aker.js");
```

- [ ] **Step 5: Update the installed-binary check**

`scripts/verify-cli-package.mjs:85`:

```javascript
    process.platform === "win32" ? "aker.cmd" : "aker",
```

- [ ] **Step 6: Run the package acceptance suite**

```bash
corepack pnpm test:cli-package
```

Expected: PASS — builds, packs, clean-installs, and smokes the tarball with the new
bin name. The smoke step runs the installed `aker`, so this proves the rename
end-to-end.

- [ ] **Step 7: Commit**

```bash
git add packages/cli/package.json scripts/build-cli-package.mjs scripts/cli-package.mjs scripts/cli-package.test.mjs scripts/verify-cli-package.mjs
git -c commit.gpgsign=false commit -m "feat(cli): rename the published binary to aker"
```

---

### Task 4: Update the plugin surface and regenerate its manifest

Spec 018's bundle is hash-verified: editing a template without regenerating the
manifest fails `pnpm test:agent-bundle`. Sequencing the regeneration here avoids
discovering that as a CI failure.

**Files:**
- Modify: `distribution/bundle-templates/claude/commands/{check,help,next,prompt,review,status}.md`
- Modify: `distribution/bundle-templates/claude/skills/aker-build/SKILL.md`
- Modify: `packages/plugin/dist/bundle-manifest.json` (regenerated)
- Modify: `distribution/evals/aker-build-skill.json`, `distribution/evals/grade.test.mjs`

**Interfaces:**
- Consumes: the renamed command from Task 3.
- Produces: a bundle whose examples match the shipped binary.

- [ ] **Step 1: Update command examples in the wrappers and skill**

Replace every `aker-build <verb>` invocation with `aker <verb>` in those seven files.
The affected strings are: `aker-build check .`, `aker-build route --stdout --format json`,
`aker-build report`, `aker-build review-pr --local-diff`, `aker-build prompt <id>`,
`aker-build --help`, and `npx aker-build check .` → `npx aker-build` stays as the
*package* invocation but its command becomes `aker`, so write it as
`npx --package aker-build aker check .`.

Do **not** change:
- The plugin name or slash-command namespace (`/aker-build:check`) — that is the
  distribution identity, from `.claude-plugin/plugin.json`.
- `skills/aker-build/SKILL.md`'s path or its `name: aker-build` frontmatter.
- Any `.aker-build/` output-directory reference.

- [ ] **Step 2: Update the eval fixtures**

In `distribution/evals/aker-build-skill.json`, update the expected_output and
assertion text that names the CLI contract, e.g.
`` `aker-build route --stdout --format json` `` → `` `aker route --stdout --format json` ``.

In `distribution/evals/grade.test.mjs`, update the `usedMachineContract` positive case:

```javascript
  assert.equal(usedMachineContract("aker route --stdout --format json"), true);
```

Then check `scripts/agent-bundle.mjs`'s `usedMachineContract` regex still matches — it
tests for `route\s+--stdout` and `aker_build_next_task`, neither of which contains the
old command name, so no change is needed there.

- [ ] **Step 3: Regenerate the bundle and commit the new baseline**

```bash
corepack pnpm build:agent-bundle
```

Expected: `Wrote 8 files to .../packages/plugin/dist`.

- [ ] **Step 4: Verify the bundle**

```bash
corepack pnpm test:agent-bundle
```

Expected: 38 tests pass and `agent bundle verified: 8 files, 9 CLI verbs checked`.

If it reports baseline drift, that is correct behavior — the manifest changed because
templates changed. Stage the regenerated `bundle-manifest.json` (Step 5) and re-run.

- [ ] **Step 5: Commit**

```bash
git add distribution/bundle-templates distribution/evals/aker-build-skill.json distribution/evals/grade.test.mjs packages/plugin/dist/bundle-manifest.json
git -c commit.gpgsign=false commit -m "feat(distribution): point the plugin surface at the aker command"
```

---

### Task 5: Update live user docs

**Files:**
- Modify: `README.md`
- Modify: `packages/cli/README.md`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: the renamed command.
- Produces: docs whose examples work when copied.

- [ ] **Step 1: Update the command examples**

Replace `aker-build <verb>` invocations with `aker <verb>` in all three files,
including the MVP command list in `CLAUDE.md`. Keep:

- `pip install aker-build` / `npm install aker-build` — distribution names.
- `npx aker-build` where it names the package; where it invokes the command, write
  `npx --package aker-build aker check .`.
- `.aker-build/`, `aker-build-report.json`, `aker-build-report.md` — artifact names.
- The `/aker-build:*` slash-command names.

- [ ] **Step 2: Add a note distinguishing package from command**

In `README.md`, immediately before the first install snippet:

```markdown
> The package is `aker-build`; the command is `aker`.
```

- [ ] **Step 3: Verify no live doc still invokes the old command**

```bash
grep -rn "aker-build \(check\|scan\|map\|gates\|queue\|route\|prompt\|report\|review-pr\) " README.md packages/cli/README.md CLAUDE.md; echo "exit=$? (1 = none found, correct)"
```

Expected: no matches, `exit=1`.

- [ ] **Step 4: Commit**

```bash
git add README.md packages/cli/README.md CLAUDE.md
git -c commit.gpgsign=false commit -m "docs: use the aker command in user-facing examples"
```

---

### Task 6: Standing rename guard and full verification

A rename verified only by "tests pass" can be both incomplete (a missed string) and
over-broad (the scope renamed). Two assertions catch each failure direction.

**Files:**
- Create: `scripts/rename-guard.mjs`
- Create: `scripts/rename-guard.test.mjs`
- Modify: `package.json` (add to `test:agent-bundle`)

**Interfaces:**
- Consumes: the completed rename from Tasks 2–5.
- Produces: `findLiveCommandRefs(root)` and `countScopeRefs(root)`.

- [ ] **Step 1: Write the failing test**

Create `scripts/rename-guard.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { findLiveCommandRefs, countScopeRefs, isHistoricalPath } from "./rename-guard.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("classifies historical records so they are exempt from the rename", () => {
  assert.equal(isHistoricalPath("specs/003-cli-scanner/spec.md"), true);
  assert.equal(isHistoricalPath("docs/decisions/ADR-002-cli-framework.md"), true);
  assert.equal(isHistoricalPath("docs/superpowers/plans/2026-07-30-agent-surface.md"), true);
  assert.equal(isHistoricalPath("README.md"), false);
  assert.equal(isHistoricalPath("packages/queue/src/context.ts"), false);
});

test("no live file invokes the retired command name", () => {
  const refs = findLiveCommandRefs(repoRoot);
  assert.deepEqual(
    refs,
    [],
    `retired command still invoked in live files:\n  ${refs.map((r) => `${r.file}:${r.line}`).join("\n  ")}`,
  );
});

test("the internal package scope was not renamed", () => {
  // The scope is a package namespace users never see. Renaming it would be a broad
  // refactor; this pins the count so the rename cannot leak into it.
  assert.equal(countScopeRefs(repoRoot), 195);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test scripts/rename-guard.test.mjs
```

Expected: FAIL — cannot find module `./rename-guard.mjs`.

- [ ] **Step 3: Write the guard**

Create `scripts/rename-guard.mjs`:

```javascript
// Standing guard for the Spec 021 command rename.
//
// Two assertions in opposite directions. One proves the rename is COMPLETE (no live
// file still tells a user to run the retired command); the other proves it was not
// OVER-BROAD (the internal @aker-build/* scope is untouched). A rename checked only by
// "tests pass" can fail either way without any test noticing.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const VERBS = [
  "check",
  "scan",
  "map",
  "gates",
  "queue",
  "route",
  "prompt",
  "report",
  "review-pr",
];

// Matches an invocation of the retired command, e.g. "aker-build scan" or
// `aker-build route --stdout`. Deliberately NOT the bare string: `.aker-build/`,
// `aker-build-report.json`, and `@aker-build/queue` are not commands and must survive.
const RETIRED = new RegExp(String.raw`\baker-build\s+(?:${VERBS.join("|")})\b`);

const SCOPE = /@aker-build\/[a-z-]+/g;

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", "coverage", ".aker-build"]);
const SCANNED_EXTENSIONS = [".md", ".ts", ".mjs", ".json", ".yml", ".yaml", ".ps1", ".sh"];

/**
 * Historical records are point-in-time evidence, not living documentation. A spec that
 * documented the old command was true when written; rewriting it would damage the audit
 * trail this project depends on, so the guard exempts these paths by design.
 */
export function isHistoricalPath(relativePath) {
  const p = relativePath.split(sep).join("/");
  return (
    p.startsWith("specs/") ||
    p.startsWith("docs/decisions/") ||
    p.startsWith("docs/roadmap/") ||
    p.startsWith("docs/superpowers/") ||
    p.startsWith("docs/evidence/") ||
    p.startsWith(".specify/") ||
    p === "docs/aker_build_project_blueprint.md"
  );
}

function walk(root, dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(root, full, out);
      continue;
    }
    if (!SCANNED_EXTENSIONS.some((ext) => entry.endsWith(ext))) continue;
    out.push(full);
  }
  return out;
}

/** Every live (non-historical) line that still invokes the retired command. */
export function findLiveCommandRefs(root) {
  const hits = [];
  for (const full of walk(root, root, [])) {
    const rel = relative(root, full);
    if (isHistoricalPath(rel)) continue;
    const lines = readFileSync(full, "utf8").split("\n");
    for (const [index, line] of lines.entries()) {
      if (RETIRED.test(line)) hits.push({ file: rel.split(sep).join("/"), line: index + 1 });
    }
  }
  return hits;
}

/** Count of internal package-scope references, which the rename must not change. */
export function countScopeRefs(root) {
  let count = 0;
  for (const full of walk(root, root, [])) {
    const rel = relative(root, full);
    if (!rel.startsWith("packages") && !rel.startsWith("scripts")) continue;
    if (!full.endsWith(".ts") && !full.endsWith(".json")) continue;
    count += (readFileSync(full, "utf8").match(SCOPE) ?? []).length;
  }
  return count;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test scripts/rename-guard.test.mjs
```

Expected: PASS, 3 tests. If the second test lists files, those are missed renames —
fix them. If the third reports a number other than 195, the scope leaked; revert that.

- [ ] **Step 5: Wire the guard into CI**

In `package.json`, extend the existing script:

```json
    "test:agent-bundle": "node --test scripts/agent-bundle.test.mjs distribution/evals/grade.test.mjs scripts/rename-guard.test.mjs && node scripts/verify-agent-bundle.mjs",
```

- [ ] **Step 6: Full verification**

```bash
corepack pnpm test:agent-bundle && corepack pnpm test && corepack pnpm typecheck && corepack pnpm test:cli-package
```

Expected: all exit 0. If `pnpm-lock.yaml` shows as modified afterward, revert it:
`git checkout pnpm-lock.yaml`.

- [ ] **Step 7: Confirm the retired name survives only where intended**

```bash
node --input-type=module -e "
import {countScopeRefs, findLiveCommandRefs} from './scripts/rename-guard.mjs';
console.log('live command refs:', findLiveCommandRefs('.').length, '(want 0)');
console.log('scope refs      :', countScopeRefs('.'), '(want 195)');
"
grep -rn "aker-build-report.json" contracts/report.schema.json | head -2
```

Expected: `0` and `195`, and the report contract still names its artifact — proving the
rename did not touch output filenames.

- [ ] **Step 8: Commit**

```bash
git add scripts/rename-guard.mjs scripts/rename-guard.test.mjs package.json
git -c commit.gpgsign=false commit -m "test: guard the aker rename against being incomplete or over-broad"
```

---

## Self-Review

**Spec coverage:** Four-things table → Tasks 2–5 change groups 1–2, Task 6 pins that
groups 3–4 are untouched. "Error strings are currently unguarded" → Task 1. Bundle
filename + validator coupling → Task 3. Plugin manifest regeneration → Task 4.
Historical records left intact → `isHistoricalPath` in Task 6. All eight Testing rows
→ Task 1 (error text), Task 6 Step 6 (`pnpm test`, `typecheck`, `test:agent-bundle`,
`test:cli-package`), Task 6 Steps 4/7 (grep and scope assertions). All five Risks →
scope test, guidance test + grep, Task 4 sequencing, CHANGELOG deferred to Task 11,
artifact-name exclusion proven in Step 7. No gaps.

**Placeholder scan:** No TBD/TODO. Every code step carries the literal replacement
text. Task 1 Step 2 is a rewrite-in-place of code introduced in Step 1, stated
explicitly rather than as "similar to".

**Type consistency:** `findLiveCommandRefs(root)` returns `{file, line}[]` and
`countScopeRefs(root)` returns a number; both are used with those shapes in the test.
`isHistoricalPath(relativePath)` takes a repo-relative string in both definition and
test. Error classes match their exports: `MissingProjectMapError`, `MissingRisksError`
from `@aker-build/queue`, verified present in `packages/queue/src/index.ts:94`.

**Note on counts:** "38 tests" and "195 scope refs" are the values measured at plan
time. If a task adds a test, the first changes — treat it as "all pass". The 195 is a
deliberate pin; if it changes, that is the signal the guard exists to raise.
