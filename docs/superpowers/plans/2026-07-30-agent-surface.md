# Agent Surface Implementation Plan (Spec 018)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a hash-verified Claude Code plugin bundle that lets any agent drive Aker Build's existing read-only control plane by knowing one name (`aker-build`), generated from a single YAML authority rather than hand-maintained markdown.

**Architecture:** A YAML authority (`distribution/agent-command-surface.yaml`) declares every slash command; reviewed markdown templates live under `distribution/bundle-templates/claude/`; a Node generator emits `packages/plugin/dist/` with a per-file SHA-256 manifest reusing Spec 017's transform idiom. Pure validation helpers live in one module and are unit-tested separately from the generator, matching the existing `scripts/cli-package.mjs` + `scripts/cli-package.test.mjs` split.

**Tech Stack:** Node.js 22.13+ (built-in `node:test`, `node:crypto`, `node:fs`), pnpm 11 workspace, `yaml@^2.6.1` (already a dependency of four packages — no lockfile change), no new runtime dependency.

## Global Constraints

- Read `docs/superpowers/specs/2026-07-30-agent-surface-design.md` before starting; it is the authority for scope.
- The agent surface is a projection: an entry MAY reference a CLI verb but MUST NEVER define one. CLI verbs stay owned by `packages/cli/src/index.ts`.
- Every `mode` value in 018 is `read-only`. No command mutates, enforces, auto-fixes, auto-commits, or auto-merges.
- Add no agent execution of any kind. The product never spawns or drives an agent (`CLAUDE.md`: "Do not execute AI agents from the product in MVP").
- Add no new runtime dependency and do not modify `pnpm-lock.yaml`.
- Do not commit, push, publish, or open a PR unless the operator explicitly requests it.
- Never use `git add -A` or `git add .`; stage named files only.
- Node floor `>=22.13`; version string is `0.1.0`, read from `packages/cli/src/version.ts` (`CLI_VERSION`).
- Existing commands, schemas, contract versions, finding logic, and verdicts remain compatible. This work is additive.
- Commit signing is required; if signing fails, stop and report rather than passing `--no-gpg-sign`.

## File Structure

| Path | Responsibility |
|---|---|
| `contracts/agent-command-surface.schema.json` | JSON Schema for the command-surface authority |
| `distribution/agent-command-surface.yaml` | The single authority: every advertised command |
| `distribution/README.md` | States the authority rule and generation flow for contributors |
| `distribution/bundle-templates/claude/.claude-plugin/plugin.json` | Plugin manifest template with a version placeholder |
| `distribution/bundle-templates/claude/skills/aker-build/SKILL.md` | The router skill (reviewed source) |
| `distribution/bundle-templates/claude/commands/{help,check,next,status,review,prompt}.md` | Thin wrappers, one per command |
| `scripts/agent-bundle.mjs` | Pure helpers: schema/entry validation, reconciliation, frontmatter parsing, hashing |
| `scripts/agent-bundle.test.mjs` | Node tests for every pure helper |
| `scripts/build-agent-bundle.mjs` | Generator: reads authority + templates, writes bundle + manifest |
| `scripts/verify-agent-bundle.mjs` | Verifier: regenerates and asserts reconciliation, hashes, verbs, modes |
| `packages/plugin/package.json` | Private workspace member owning the bundle output |
| `.github/workflows/aker-build.yml` | Add a non-publishing bundle-verification step |

Tasks 1–3 build the authority and its validators; Task 4 authors the surface content; Task 5 generates; Task 6 verifies end-to-end; Task 7 wires CI and docs; Task 8 runs the skill eval.

---

### Task 1: Command-surface schema and entry validation

**Files:**
- Create: `contracts/agent-command-surface.schema.json`
- Create: `scripts/agent-bundle.mjs`
- Test: `scripts/agent-bundle.test.mjs`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `validateSurfaceEntry(entry) -> string[]` (returns problem strings, empty array means valid) and `SHIPPED_MODES = ["read-only"]`, both from `scripts/agent-bundle.mjs`.

- [ ] **Step 1: Write the failing test**

Create `scripts/agent-bundle.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { validateSurfaceEntry } from "./agent-bundle.mjs";

const valid = {
  name: "next",
  platform: "claude",
  intent: "Return the one next-safest task with derived scope.",
  cli_verbs: ["route"],
  skill: "aker-build",
  wrapper_template: "distribution/bundle-templates/claude/commands/next.md",
  bundle_destination: "commands/next.md",
  mode: "read-only",
  status: "shipped",
};

test("accepts a well-formed shipped entry", () => {
  assert.deepEqual(validateSurfaceEntry(valid), []);
});

test("rejects a mutating mode because 018 ships a read-only surface", () => {
  const problems = validateSurfaceEntry({ ...valid, mode: "mutating" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /mode/);
});

test("rejects a shipped entry with no wrapper template", () => {
  const problems = validateSurfaceEntry({ ...valid, wrapper_template: "" });
  assert.match(problems.join(" "), /wrapper_template/);
});

test("requires a deferred entry to ship no wrapper or destination", () => {
  const problems = validateSurfaceEntry({
    ...valid,
    name: "auto",
    status: "deferred",
  });
  assert.match(problems.join(" "), /deferred/);
});

test("accepts a deferred entry that declares no wrapper", () => {
  assert.deepEqual(
    validateSurfaceEntry({
      name: "auto",
      platform: "claude",
      intent: "Run the governed loop until the next human gate.",
      cli_verbs: [],
      skill: "aker-build",
      wrapper_template: "",
      bundle_destination: "",
      mode: "read-only",
      status: "deferred",
    }),
    [],
  );
});

test("accepts an empty cli_verbs list so the surface can carry verb-less commands", () => {
  assert.deepEqual(validateSurfaceEntry({ ...valid, name: "help", cli_verbs: [] }), []);
});

test("rejects an unknown platform", () => {
  assert.match(validateSurfaceEntry({ ...valid, platform: "codex" }).join(" "), /platform/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: FAIL — cannot find module `./agent-bundle.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `scripts/agent-bundle.mjs`:

```javascript
// Pure helpers for the agent-surface bundle. Kept free of filesystem writes so the
// validation rules can be unit-tested directly, matching scripts/cli-package.mjs.

import { createHash } from "node:crypto";

export const SHIPPED_MODES = ["read-only"];
const PLATFORMS = ["claude"];
const STATUSES = ["shipped", "deferred", "internal"];
const REQUIRED_FIELDS = [
  "name",
  "platform",
  "intent",
  "cli_verbs",
  "skill",
  "wrapper_template",
  "bundle_destination",
  "mode",
  "status",
];

/**
 * Validate one command-surface entry, returning a problem string per rule broken.
 *
 * Returning a list rather than throwing lets the caller report every problem in one
 * pass; a generator that failed on the first bad entry would make fixing a surface
 * an iterative guessing game.
 */
export function validateSurfaceEntry(entry) {
  const problems = [];
  if (entry === null || typeof entry !== "object") return ["entry is not an object"];

  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) problems.push(`${entry.name ?? "(unnamed)"}: missing ${field}`);
  }
  if (problems.length > 0) return problems;

  const id = entry.name;
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) {
    problems.push(`${id}: name must be lower-kebab-case`);
  }
  if (!PLATFORMS.includes(entry.platform)) {
    problems.push(`${id}: platform must be one of ${PLATFORMS.join(", ")}`);
  }
  if (typeof entry.intent !== "string" || entry.intent.trim() === "") {
    problems.push(`${id}: intent must be a non-empty string`);
  }
  if (!Array.isArray(entry.cli_verbs)) {
    problems.push(`${id}: cli_verbs must be an array (empty is allowed)`);
  }
  if (!STATUSES.includes(entry.status)) {
    problems.push(`${id}: status must be one of ${STATUSES.join(", ")}`);
  }
  // 018 ships a read-only surface; a mutating entry must be a recorded decision,
  // not a quiet edit, so the rule lives in code rather than in review habit.
  if (!SHIPPED_MODES.includes(entry.mode)) {
    problems.push(`${id}: mode must be one of ${SHIPPED_MODES.join(", ")}`);
  }

  const shipped = entry.status === "shipped";
  if (shipped && (!entry.wrapper_template || !entry.bundle_destination)) {
    problems.push(`${id}: shipped entries need wrapper_template and bundle_destination`);
  }
  if (!shipped && (entry.wrapper_template || entry.bundle_destination)) {
    problems.push(`${id}: ${entry.status} entries must declare no wrapper_template or bundle_destination`);
  }
  return problems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: PASS, 7 tests.

- [ ] **Step 5: Write the JSON Schema**

Create `contracts/agent-command-surface.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://github.com/Kemetra/Aker-Build/contracts/agent-command-surface.schema.json",
  "title": "Aker Build agent command surface",
  "description": "The single authority for what a generated agent bundle advertises. An entry MAY reference a CLI verb but MUST NEVER define one; CLI verbs are owned by packages/cli/src/index.ts.",
  "type": "object",
  "additionalProperties": false,
  "required": ["schema_version", "canonical_repository", "commands"],
  "properties": {
    "schema_version": { "type": "integer", "const": 1 },
    "canonical_repository": { "type": "string", "minLength": 1 },
    "commands": {
      "type": "array",
      "minItems": 1,
      "items": { "$ref": "#/$defs/command" }
    }
  },
  "$defs": {
    "command": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "name",
        "platform",
        "intent",
        "cli_verbs",
        "skill",
        "wrapper_template",
        "bundle_destination",
        "mode",
        "status"
      ],
      "properties": {
        "name": { "type": "string", "pattern": "^[a-z][a-z0-9-]*$" },
        "platform": { "type": "string", "enum": ["claude"] },
        "intent": { "type": "string", "minLength": 1 },
        "cli_verbs": { "type": "array", "items": { "type": "string", "minLength": 1 } },
        "skill": { "type": "string", "minLength": 1 },
        "wrapper_template": { "type": "string" },
        "bundle_destination": { "type": "string" },
        "mode": { "type": "string", "enum": ["read-only"] },
        "status": { "type": "string", "enum": ["shipped", "deferred", "internal"] }
      }
    }
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add contracts/agent-command-surface.schema.json scripts/agent-bundle.mjs scripts/agent-bundle.test.mjs
git commit -m "feat(distribution): validate agent command-surface entries"
```

---

### Task 2: Bidirectional reconciliation

**Files:**
- Modify: `scripts/agent-bundle.mjs`
- Test: `scripts/agent-bundle.test.mjs`

**Interfaces:**
- Consumes: `validateSurfaceEntry` from Task 1.
- Produces: `reconcile({ entries, wrapperPaths }) -> string[]`, where `wrapperPaths` is an array of repo-relative template paths discovered on disk.

- [ ] **Step 1: Write the failing test**

Append to `scripts/agent-bundle.test.mjs`:

```javascript
import { reconcile } from "./agent-bundle.mjs";

const shipped = (name) => ({
  name,
  platform: "claude",
  intent: `Do ${name}.`,
  cli_verbs: [],
  skill: "aker-build",
  wrapper_template: `distribution/bundle-templates/claude/commands/${name}.md`,
  bundle_destination: `commands/${name}.md`,
  mode: "read-only",
  status: "shipped",
});

test("passes when the authority and the wrappers on disk agree", () => {
  assert.deepEqual(
    reconcile({
      entries: [shipped("check"), shipped("next")],
      wrapperPaths: [
        "distribution/bundle-templates/claude/commands/check.md",
        "distribution/bundle-templates/claude/commands/next.md",
      ],
    }),
    [],
  );
});

test("fails on a wrapper that no authority entry declares", () => {
  const problems = reconcile({
    entries: [shipped("check")],
    wrapperPaths: [
      "distribution/bundle-templates/claude/commands/check.md",
      "distribution/bundle-templates/claude/commands/sneaky.md",
    ],
  });
  assert.match(problems.join(" "), /sneaky\.md/);
});

test("fails on a shipped entry whose wrapper is missing from disk", () => {
  const problems = reconcile({
    entries: [shipped("check"), shipped("ghost")],
    wrapperPaths: ["distribution/bundle-templates/claude/commands/check.md"],
  });
  assert.match(problems.join(" "), /ghost\.md/);
});

test("ignores a deferred entry when reconciling wrappers", () => {
  const deferred = {
    ...shipped("auto"),
    status: "deferred",
    wrapper_template: "",
    bundle_destination: "",
  };
  assert.deepEqual(
    reconcile({
      entries: [shipped("check"), deferred],
      wrapperPaths: ["distribution/bundle-templates/claude/commands/check.md"],
    }),
    [],
  );
});

test("fails on two entries claiming the same bundle destination", () => {
  const clash = { ...shipped("next"), bundle_destination: "commands/check.md" };
  const problems = reconcile({
    entries: [shipped("check"), clash],
    wrapperPaths: [
      "distribution/bundle-templates/claude/commands/check.md",
      "distribution/bundle-templates/claude/commands/next.md",
    ],
  });
  assert.match(problems.join(" "), /duplicate/i);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: FAIL — `reconcile` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `scripts/agent-bundle.mjs`:

```javascript
/**
 * Reconcile the authority against the wrappers that actually exist on disk.
 *
 * Both directions matter. Checking only authority-to-disk lets an unreviewed wrapper
 * ship; checking only disk-to-authority lets the authority advertise a command that
 * does not exist. Together they make the surface reviewed rather than accumulated.
 */
export function reconcile({ entries, wrapperPaths }) {
  const problems = [];
  const shipped = entries.filter((e) => e.status === "shipped");

  const declared = new Set(shipped.map((e) => e.wrapper_template));
  const onDisk = new Set(wrapperPaths);

  for (const path of onDisk) {
    if (!declared.has(path)) {
      problems.push(`wrapper ${path} is absent from the command surface authority`);
    }
  }
  for (const entry of shipped) {
    if (!onDisk.has(entry.wrapper_template)) {
      problems.push(`${entry.name}: declared wrapper ${entry.wrapper_template} is missing on disk`);
    }
  }

  const seenNames = new Set();
  const seenDestinations = new Set();
  for (const entry of entries) {
    if (seenNames.has(entry.name)) problems.push(`duplicate command name ${entry.name}`);
    seenNames.add(entry.name);
    if (entry.status !== "shipped") continue;
    if (seenDestinations.has(entry.bundle_destination)) {
      problems.push(`duplicate bundle destination ${entry.bundle_destination}`);
    }
    seenDestinations.add(entry.bundle_destination);
  }
  return problems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-bundle.mjs scripts/agent-bundle.test.mjs
git commit -m "feat(distribution): reconcile the command surface against wrappers on disk"
```

---

### Task 3: Frontmatter parsing and CLI verb extraction

**Files:**
- Modify: `scripts/agent-bundle.mjs`
- Test: `scripts/agent-bundle.test.mjs`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `parseFrontmatter(text) -> { description: string | null, body: string }`, `validateWrapperText(text) -> string[]`, and `extractCliVerbs(indexSource) -> string[]`.

- [ ] **Step 1: Write the failing test**

Append to `scripts/agent-bundle.test.mjs`:

```javascript
import { parseFrontmatter, validateWrapperText, extractCliVerbs } from "./agent-bundle.mjs";

test("parses a description out of wrapper frontmatter", () => {
  const parsed = parseFrontmatter("---\ndescription: Do the thing\n---\n\nBody text.\n");
  assert.equal(parsed.description, "Do the thing");
  assert.equal(parsed.body.trim(), "Body text.");
});

test("reports a null description when frontmatter is absent", () => {
  assert.equal(parseFrontmatter("Just a body.\n").description, null);
});

test("rejects a wrapper with no description because it drives slash-command discovery", () => {
  assert.match(validateWrapperText("No frontmatter here.\n").join(" "), /description/);
});

test("rejects a wrapper with an empty body", () => {
  assert.match(validateWrapperText("---\ndescription: Hi\n---\n\n").join(" "), /body/);
});

test("accepts a wrapper carrying both a description and a body", () => {
  assert.deepEqual(validateWrapperText("---\ndescription: Hi\n---\n\nLoad the skill.\n"), []);
});

test("extracts registered CLI verbs from the commander index source", () => {
  const source = `
    program.command("check").description("Run the chain");
    program.command("route").description("Select one next task");
  `;
  assert.deepEqual(extractCliVerbs(source), ["check", "route"]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: FAIL — `parseFrontmatter` is not exported.

- [ ] **Step 3: Write the minimal implementation**

Append to `scripts/agent-bundle.mjs`:

```javascript
/**
 * Read the `description` field out of a wrapper's YAML frontmatter.
 *
 * Deliberately a narrow line-scanner rather than a YAML parse: a wrapper's frontmatter
 * carries exactly one scalar field, and keeping this dependency-free lets the verifier
 * run before any install step.
 */
export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { description: null, body: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { description: null, body: normalized };

  const block = normalized.slice(4, end);
  const body = normalized.slice(end + 4);
  let description = null;
  for (const line of block.split("\n")) {
    const match = /^description:\s*(.+)$/.exec(line.trim());
    if (match) description = match[1].trim().replace(/^["']|["']$/g, "");
  }
  return { description, body };
}

/** A wrapper needs a description (it is what an agent sees when choosing a command) and a body. */
export function validateWrapperText(text) {
  const problems = [];
  const { description, body } = parseFrontmatter(text);
  if (!description) problems.push("wrapper is missing a frontmatter description");
  if (body.trim() === "") problems.push("wrapper has an empty body");
  return problems;
}

/**
 * List the verbs Commander actually registers in the CLI entrypoint.
 *
 * This is what makes the projection rule enforceable: if a verb is renamed, a surface
 * entry referencing the old name fails the build instead of quietly advertising a verb
 * that no longer exists.
 */
export function extractCliVerbs(indexSource) {
  const verbs = [];
  const pattern = /\.command\(\s*"([a-z][a-z0-9-]*)"/g;
  let match;
  while ((match = pattern.exec(indexSource)) !== null) verbs.push(match[1]);
  return verbs;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/agent-bundle.mjs scripts/agent-bundle.test.mjs
git commit -m "feat(distribution): parse wrapper frontmatter and extract CLI verbs"
```

---

### Task 4: Author the authority, router skill, and wrappers

**Files:**
- Create: `distribution/agent-command-surface.yaml`
- Create: `distribution/bundle-templates/claude/.claude-plugin/plugin.json`
- Create: `distribution/bundle-templates/claude/skills/aker-build/SKILL.md`
- Create: `distribution/bundle-templates/claude/commands/help.md`
- Create: `distribution/bundle-templates/claude/commands/check.md`
- Create: `distribution/bundle-templates/claude/commands/next.md`
- Create: `distribution/bundle-templates/claude/commands/status.md`
- Create: `distribution/bundle-templates/claude/commands/review.md`
- Create: `distribution/bundle-templates/claude/commands/prompt.md`

**Interfaces:**
- Consumes: the field names validated in Task 1.
- Produces: the authority file and templates that Task 5's generator reads.

- [ ] **Step 1: Write the authority**

Create `distribution/agent-command-surface.yaml`:

```yaml
# Canonical public command surface -- the single authority for what the generated
# agent bundle advertises.
#
# Scope: agent-platform surfaces only. CLI verbs remain owned by
# `packages/cli/src/index.ts`; an entry here MAY reference a CLI verb but never
# defines one. The agent surface is a projection of the CLI, never a second
# source of truth.
#
# Reconciled by `scripts/verify-agent-bundle.mjs`. Every shipped command needs a
# reviewed wrapper template and a generated bundle file; a deferred or internal
# entry must have neither. Adding a command here without shipping its wrapper --
# or shipping a wrapper absent from here -- fails verification.
schema_version: 1
canonical_repository: Kemetra/Aker-Build
commands:
  - name: help
    platform: claude
    intent: Show the accurate installed Aker Build command map and surface distinctions.
    cli_verbs: []
    skill: aker-build
    wrapper_template: distribution/bundle-templates/claude/commands/help.md
    bundle_destination: commands/help.md
    mode: read-only
    status: shipped
  - name: check
    platform: claude
    intent: Run the read-only chain and interpret its findings as advisory.
    cli_verbs: [check]
    skill: aker-build
    wrapper_template: distribution/bundle-templates/claude/commands/check.md
    bundle_destination: commands/check.md
    mode: read-only
    status: shipped
  - name: next
    platform: claude
    intent: Return the one next-safest task with its derived file scope.
    cli_verbs: [route]
    skill: aker-build
    wrapper_template: distribution/bundle-templates/claude/commands/next.md
    bundle_destination: commands/next.md
    mode: read-only
    status: shipped
  - name: status
    platform: claude
    intent: Report the state of produced Aker Build artifacts exactly as recorded.
    cli_verbs: [report]
    skill: aker-build
    wrapper_template: distribution/bundle-templates/claude/commands/status.md
    bundle_destination: commands/status.md
    mode: read-only
    status: shipped
  - name: review
    platform: claude
    intent: Review a local diff or PR and report Ready / Not Ready / Needs Verification.
    cli_verbs: [review-pr]
    skill: aker-build
    wrapper_template: distribution/bundle-templates/claude/commands/review.md
    bundle_destination: commands/review.md
    mode: read-only
    status: shipped
  - name: prompt
    platform: claude
    intent: Compile the safe, scoped agent prompt for one queue item.
    cli_verbs: [prompt]
    skill: aker-build
    wrapper_template: distribution/bundle-templates/claude/commands/prompt.md
    bundle_destination: commands/prompt.md
    mode: read-only
    status: shipped
  # Spec 019 ships the governed loop. Recorded here so the authority states the
  # planned surface, with no wrapper and no bundle file until 019 lands.
  - name: auto
    platform: claude
    intent: Run the governed loop one action at a time until the next human gate.
    cli_verbs: []
    skill: aker-build
    wrapper_template: ""
    bundle_destination: ""
    mode: read-only
    status: deferred
```

- [ ] **Step 2: Write the plugin manifest template**

Create `distribution/bundle-templates/claude/.claude-plugin/plugin.json`:

```json
{
  "name": "aker-build",
  "version": "__VERSION__",
  "description": "Drive Aker Build's read-only SaaS build kernel from an agent: next safest task, derived scope, and gate findings.",
  "author": { "name": "Ahmed Shaaban" },
  "homepage": "https://github.com/Kemetra/Aker-Build",
  "repository": "https://github.com/Kemetra/Aker-Build",
  "license": "MIT",
  "skills": "./skills/",
  "commands": "./commands/"
}
```

- [ ] **Step 3: Write the router skill**

Create `distribution/bundle-templates/claude/skills/aker-build/SKILL.md`:

```markdown
---
name: aker-build
description: >-
  Find the next safest task in a repository and the exact files it is allowed to
  touch, using Aker Build's read-only build kernel. Use when a user or agent asks
  what to work on next, which change is safe to make, what a repository's
  architecture or multi-tenant risks are, whether a diff or PR is ready to merge,
  or asks for a scoped prompt for a coding task. Also use before starting
  unscoped work in an unfamiliar repository, when someone asks "what should I do
  next here", or when a change needs a defensible file scope rather than a
  guessed one.
---

# Aker Build

Aker Build is a build-control kernel: it scans a repository, runs SaaS gates over
what it finds, derives a queue, and routes the one next-safest task along with the
files that task may touch. Everything it exposes is read-only — it reports, and
never mutates, enforces, or executes an agent.

## Getting the next action

Prefer the machine contract over guessing a command. Two surfaces return it:

- The MCP tool `aker_build_next_task`, when the server is wired.
- Otherwise the CLI: `aker-build route --stdout --format json`.

Both return one decision: either an item with its derived scope, or an explicit
"no safe task" with named reasons, plus a `blocked` list explaining every item the
router declined. Guessing a verb or inventing a task id produces a confidently
wrong answer; the contract returns either an action or a named blocker, which is
always actionable.

If the queue does not exist yet, run the chain first: `aker-build check .` performs
scan → gates → queue → route → report in one read-only pass.

## Reporting scope

`allowed_files` and `forbidden_files` are *derived* from a scan of the
architecture, not declared by hand. Report them as returned. Widening the set
discards the analysis that justified it, and the derived scope is the reason the
task was considered safe in the first place.

Use `aker_build_compile_prompt` (or `aker-build prompt <id>`) to get the scoped
prompt for an item. The compiler refuses to emit a prompt when scope information
is missing rather than guessing — treat that refusal as a real signal about the
item, not an error to work around.

## What this kernel does not claim

- **Findings are advisory.** A clean `check` is necessary, not sufficient. It does
  not prove semantic correctness and it grants no approval.
- **Never emit a readiness or confidence score.** Queue items already carry a
  measured `confidence_tier` (`confirmed` or `suspected`). A synthesized score
  layers a fabricated number on measured ones, and a reader cannot tell which is
  which.
- **Report a `suspected` tier as suspected.** The tier is the honest statement of
  how much evidence exists; upgrading it in a summary destroys the distinction
  that makes the tier useful.
- **Never simulate output.** If `aker-build` is not installed, say so and point to
  `npx aker-build check .` rather than describing what it would have printed.

## Discovering the surface

Nothing here needs memorizing:

- `/aker-build:help` prints the installed slash-command map.
- `aker-build --help` lists every installed CLI verb.

Slash commands and CLI verbs are different surfaces: a slash command is a reviewed
prompt inside this agent session, while `aker-build` is a separately installed npm
package. Useful CLI verbs with no slash wrapper include `scan`, `map`, `gates`, and
`queue` — they are sub-steps of `check`, and running them out of order produces
artifacts that do not correspond to one another.
```

- [ ] **Step 4: Write the six wrappers**

Create `distribution/bundle-templates/claude/commands/help.md`:

```markdown
---
description: Show the installed Aker Build command map and how each surface is used
---

Report the installed Aker Build surface truthfully; never advertise anything
absent from this list.

Slash commands (Claude Code namespaces them by plugin, so invoke as
`/aker-build:<name>`, e.g. `/aker-build:next`):

- `help` -- this command map.
- `check` -- run the read-only chain and interpret its findings.
- `next` -- return the one next-safest task with its derived file scope.
- `status` -- report the state of produced artifacts as recorded.
- `review` -- review a local diff or PR for merge readiness.
- `prompt` -- compile the safe, scoped prompt for one queue item.

Bundled skill: `aker-build` (the build-kernel router).

Slash commands and terminal CLI verbs are different surfaces: a slash command is a
reviewed prompt inside this agent session, while `aker-build` is a separately
installed npm package (`npx aker-build check .`). If it is not installed, say so
instead of simulating its output. CLI-only verbs include `scan`, `map`, `gates`,
and `queue` (sub-steps of `check`); list everything with `aker-build --help`.
```

Create `distribution/bundle-templates/claude/commands/check.md`:

```markdown
---
description: Run the read-only Aker Build chain and interpret its findings
---

Load the `aker-build` skill. Run `aker-build check .` if installed — one read-only
pass of scan → gates → queue → route → report — and interpret its output as
advisory evidence. A clean check is necessary but not sufficient: it does not prove
semantic correctness and grants no approval. Report `suspected` findings as
suspected, and never emit a readiness or confidence score.
```

Create `distribution/bundle-templates/claude/commands/next.md`:

```markdown
---
description: Return the one next-safest task with its derived file scope
---

Load the `aker-build` skill. Obtain exactly one next action — prefer the MCP tool
`aker_build_next_task`, else `aker-build route --stdout --format json` — and report
the item with its derived `allowed_files` and `forbidden_files` exactly as
returned, plus the evidence that justified them. Never widen the scope. When there
is no safe task, report the named reasons and the blocked items rather than
choosing one anyway.
```

Create `distribution/bundle-templates/claude/commands/status.md`:

```markdown
---
description: Report the state of produced Aker Build artifacts as recorded
---

Load the `aker-build` skill. Run `aker-build report` if installed and report the
recorded artifact state exactly as returned. An empty queue is a truthful answer,
not an error. Never invent a finding, upgrade a `suspected` tier to confirmed, or
emit a numeric readiness or confidence score.
```

Create `distribution/bundle-templates/claude/commands/review.md`:

```markdown
---
description: Review a local diff or PR for merge readiness against the gates
---

Load the `aker-build` skill. Run `aker-build review-pr --local-diff` (or against
the named PR) and report the verdict exactly as returned: Ready, Not Ready, or
Needs Verification. Needs Verification is a real verdict, not a soft pass — report
it as-is with the evidence behind it, and never upgrade it to Ready.
```

Create `distribution/bundle-templates/claude/commands/prompt.md`:

```markdown
---
description: Compile the safe, scoped agent prompt for one queue item
---

Load the `aker-build` skill. Compile the prompt for the queue item id the user
named (for example `/aker-build:prompt Q-001`), preferring the MCP tool
`aker_build_compile_prompt`, else `aker-build prompt <id>`. Return the compiled
prompt as-is: it already carries the objective, allowed and forbidden files,
validation commands, git rules, stop conditions, and the required final-report
shape. If the compiler refuses because scope information is missing, report that
refusal — it is a real signal about the item, not an error to work around.
```

- [ ] **Step 5: Verify every wrapper has valid frontmatter**

```bash
node --input-type=module -e "import {readFileSync,readdirSync} from 'node:fs';import {validateWrapperText} from './scripts/agent-bundle.mjs';const d='distribution/bundle-templates/claude/commands';let bad=0;for(const f of readdirSync(d)){const p=validateWrapperText(readFileSync(d+'/'+f,'utf8'));if(p.length){bad++;console.log(f,p);}}console.log(bad===0?'all wrappers valid':'PROBLEMS');"
```

Expected: `all wrappers valid`.

- [ ] **Step 6: Commit**

```bash
git add distribution/agent-command-surface.yaml distribution/bundle-templates
git commit -m "feat(distribution): author the aker-build router skill and command wrappers"
```

---

### Task 5: The bundle generator

**Files:**
- Create: `scripts/build-agent-bundle.mjs`
- Create: `packages/plugin/package.json`
- Modify: `package.json` (add `build:agent-bundle` script)

**Interfaces:**
- Consumes: `validateSurfaceEntry`, `reconcile`, `validateWrapperText` from Tasks 1–3; the authority and templates from Task 4.
- Produces: `buildAgentBundle() -> { output: string, manifest: object }`, exported from `scripts/build-agent-bundle.mjs`; writes `packages/plugin/dist/`.

- [ ] **Step 1: Add the workspace member**

Create `packages/plugin/package.json`:

```json
{
  "name": "@aker-build/plugin",
  "version": "0.1.0",
  "private": true,
  "description": "Generated Claude Code plugin bundle — the agent surface for Aker Build's read-only kernel",
  "license": "MIT",
  "type": "module",
  "scripts": {
    "test": "node --test ../../scripts/agent-bundle.test.mjs"
  }
}
```

- [ ] **Step 2: Add hashing and manifest helpers**

Append to `scripts/agent-bundle.mjs` (the `node:crypto` import is already at the top of the file from Task 1 — do not add a second one):

```javascript
/** Normalize to LF with exactly one trailing newline so hashes are stable across platforms. */
export function normalizeText(text) {
  return `${text.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n`;
}

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** One manifest entry per generated file, mirroring the shape Spec 017 already proves. */
export function manifestEntry({ source, sourceText, destination, outputText, transform, classification }) {
  return {
    classification,
    destination,
    output_sha256: sha256(outputText),
    source,
    source_sha256: sha256(sourceText),
    transform,
  };
}
```

- [ ] **Step 3: Write the generator**

Create `scripts/build-agent-bundle.mjs`:

```javascript
// Generate the Claude Code plugin bundle from the command-surface authority.
// The bundle is an output, never a hand-edited tree: that is what lets us answer
// "is this the bundle we reviewed?" by hash.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  manifestEntry,
  normalizeText,
  reconcile,
  validateSurfaceEntry,
  validateWrapperText,
} from "./agent-bundle.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templates = join(repo, "distribution", "bundle-templates", "claude");
const output = join(repo, "packages", "plugin", "dist");

const AUTHORITY = "distribution/agent-command-surface.yaml";
const WRAPPER_DIR = "distribution/bundle-templates/claude/commands";
const SKILL_SOURCE = "distribution/bundle-templates/claude/skills/aker-build/SKILL.md";
const PLUGIN_SOURCE = "distribution/bundle-templates/claude/.claude-plugin/plugin.json";

function readRepoFile(relative) {
  return readFileSync(join(repo, relative), "utf8");
}

function cliVersion() {
  const source = readRepoFile("packages/cli/src/version.ts");
  const match = /CLI_VERSION\s*=\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("could not read CLI_VERSION from packages/cli/src/version.ts");
  return match[1];
}

function writeBundleFile(destination, text) {
  const target = join(output, destination);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

export function buildAgentBundle() {
  const surface = parseYaml(readRepoFile(AUTHORITY));
  const problems = surface.commands.flatMap((entry) => validateSurfaceEntry(entry));

  const wrapperPaths = readdirSync(join(templates, "commands"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `${WRAPPER_DIR}/${name}`);
  problems.push(...reconcile({ entries: surface.commands, wrapperPaths }));

  if (problems.length > 0) {
    throw new Error(`agent command surface is invalid:\n  ${problems.join("\n  ")}`);
  }

  rmSync(output, { recursive: true, force: true });
  const entries = [];

  // plugin.json — the only file needing substitution, so version has one source of truth.
  const pluginSource = readRepoFile(PLUGIN_SOURCE);
  const pluginText = normalizeText(pluginSource.replace("__VERSION__", cliVersion()));
  writeBundleFile(".claude-plugin/plugin.json", pluginText);
  entries.push(
    manifestEntry({
      source: PLUGIN_SOURCE,
      sourceText: pluginSource,
      destination: ".claude-plugin/plugin.json",
      outputText: pluginText,
      transform: "template-substitute-version-v1",
      classification: "generated_wrapper",
    }),
  );

  // The router skill.
  const skillSource = readRepoFile(SKILL_SOURCE);
  const skillText = normalizeText(skillSource);
  writeBundleFile("skills/aker-build/SKILL.md", skillText);
  entries.push(
    manifestEntry({
      source: SKILL_SOURCE,
      sourceText: skillSource,
      destination: "skills/aker-build/SKILL.md",
      outputText: skillText,
      transform: "copy-normalized-v1",
      classification: "router_skill",
    }),
  );

  // One wrapper per shipped command, in authority order for a stable manifest.
  for (const entry of surface.commands.filter((c) => c.status === "shipped")) {
    const wrapperSource = readRepoFile(entry.wrapper_template);
    const wrapperProblems = validateWrapperText(wrapperSource);
    if (wrapperProblems.length > 0) {
      throw new Error(`${entry.wrapper_template}: ${wrapperProblems.join("; ")}`);
    }
    const wrapperText = normalizeText(wrapperSource);
    writeBundleFile(entry.bundle_destination, wrapperText);
    entries.push(
      manifestEntry({
        source: entry.wrapper_template,
        sourceText: wrapperSource,
        destination: entry.bundle_destination,
        outputText: wrapperText,
        transform: "copy-normalized-v1",
        classification: "generated_wrapper",
      }),
    );
  }

  const manifest = { entries };
  writeFileSync(join(output, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { output, manifest };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { output: dir, manifest } = buildAgentBundle();
  process.stdout.write(`Wrote ${manifest.entries.length} files to ${dir}\n`);
}
```

- [ ] **Step 4: Add the workspace script**

In `package.json`, add to `scripts` after the `build:cli-package` line:

```json
    "build:agent-bundle": "node scripts/build-agent-bundle.mjs",
```

- [ ] **Step 5: Run the generator**

```bash
node scripts/build-agent-bundle.mjs
```

Expected: `Wrote 8 files to .../packages/plugin/dist` (plugin.json + skill + 6 wrappers).

- [ ] **Step 6: Confirm the bundle shape**

```bash
node --input-type=module -e "import {readFileSync} from 'node:fs';const m=JSON.parse(readFileSync('packages/plugin/dist/bundle-manifest.json','utf8'));console.log(m.entries.map(e=>e.destination).join('\n'));console.log('entries:',m.entries.length);"
```

Expected: 8 destinations listed, including `commands/help.md` and `skills/aker-build/SKILL.md`.

- [ ] **Step 7: Ignore the generated files, but commit the manifest**

Append to `.gitignore`:

```gitignore
# Generated agent bundle. The manifest is committed as the reviewed baseline
# (see scripts/verify-agent-bundle.mjs); the files it describes are not.
packages/plugin/dist/*
!packages/plugin/dist/bundle-manifest.json
```

Committing the manifest is what makes "is this the bundle we reviewed?" answerable.
Comparing two fresh generator runs only proves determinism within one process; a
committed manifest is the baseline a reviewer actually approved, so a changed
template shows up as a manifest diff in review. This mirrors Spec 017, where
`packages/cli/dist/npm/` is generated but `release-preflight.mjs` fails closed
against committed expectations.

- [ ] **Step 8: Commit**

```bash
git add scripts/agent-bundle.mjs scripts/build-agent-bundle.mjs packages/plugin/package.json package.json .gitignore packages/plugin/dist/bundle-manifest.json
git commit -m "feat(distribution): generate the hash-verified agent bundle"
```

---

### Task 6: The verifier

**Files:**
- Create: `scripts/verify-agent-bundle.mjs`
- Modify: `scripts/agent-bundle.test.mjs`
- Modify: `package.json` (add `test:agent-bundle` script)

**Interfaces:**
- Consumes: `buildAgentBundle` from Task 5; `extractCliVerbs` from Task 3.
- Produces: a process exiting 0 on a valid bundle and non-zero with named problems otherwise.

- [ ] **Step 1: Write the failing test for verb checking**

Append to `scripts/agent-bundle.test.mjs`:

```javascript
import { checkCliVerbsExist } from "./agent-bundle.mjs";

test("passes when every referenced CLI verb is registered", () => {
  assert.deepEqual(
    checkCliVerbsExist({
      entries: [{ name: "next", cli_verbs: ["route"], status: "shipped" }],
      registered: ["check", "route", "report"],
    }),
    [],
  );
});

test("fails on a referenced verb the CLI does not register", () => {
  const problems = checkCliVerbsExist({
    entries: [{ name: "ghost", cli_verbs: ["vanished"], status: "shipped" }],
    registered: ["check", "route"],
  });
  assert.match(problems.join(" "), /vanished/);
});

test("accepts a shipped command that references no verb", () => {
  assert.deepEqual(
    checkCliVerbsExist({
      entries: [{ name: "help", cli_verbs: [], status: "shipped" }],
      registered: ["check"],
    }),
    [],
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: FAIL — `checkCliVerbsExist` is not exported.

- [ ] **Step 3: Implement the verb check**

Append to `scripts/agent-bundle.mjs`:

```javascript
/**
 * Confirm every referenced CLI verb still exists.
 *
 * The surface is a projection of the CLI, so a renamed verb must break the build
 * loudly rather than leave the bundle advertising a verb that no longer resolves.
 */
export function checkCliVerbsExist({ entries, registered }) {
  const known = new Set(registered);
  const problems = [];
  for (const entry of entries) {
    if (entry.status !== "shipped") continue;
    for (const verb of entry.cli_verbs ?? []) {
      if (!known.has(verb)) {
        problems.push(`${entry.name}: references CLI verb "${verb}" which is not registered`);
      }
    }
  }
  return problems;
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
node --test scripts/agent-bundle.test.mjs
```

Expected: PASS, 21 tests.

- [ ] **Step 5: Write the verifier**

Create `scripts/verify-agent-bundle.mjs`:

```javascript
// Verify the generated agent bundle: reproducible hashes, existing CLI verbs, and a
// read-only surface. Fails closed with named problems so a breakage is diagnosable.

import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { buildAgentBundle } from "./build-agent-bundle.mjs";
import { checkCliVerbsExist, extractCliVerbs, sha256, SHIPPED_MODES } from "./agent-bundle.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function main() {
  const problems = [];

  // Read the reviewed baseline BEFORE regenerating, since generating overwrites it.
  const manifestPath = join(repo, "packages/plugin/dist/bundle-manifest.json");
  let committed = null;
  try {
    committed = readFileSync(manifestPath, "utf8");
  } catch {
    problems.push(
      "packages/plugin/dist/bundle-manifest.json is missing — run `pnpm build:agent-bundle` and commit it as the reviewed baseline",
    );
  }

  // Generating twice must yield identical manifests, or "verified by hash" means nothing.
  const first = buildAgentBundle();
  const second = buildAgentBundle();
  if (JSON.stringify(first.manifest) !== JSON.stringify(second.manifest)) {
    problems.push("generator is not reproducible: two runs produced different manifests");
  }

  // The regenerated manifest must match the committed baseline. Determinism alone
  // proves nothing about whether this is the bundle a reviewer approved.
  if (committed !== null) {
    const regenerated = `${JSON.stringify(second.manifest, null, 2)}\n`;
    if (regenerated !== committed) {
      problems.push(
        "regenerated manifest differs from the committed baseline — if a template changed on purpose, run `pnpm build:agent-bundle` and commit the new manifest",
      );
    }
  }

  // Every manifest hash must match the bytes actually on disk.
  for (const entry of second.manifest.entries) {
    const onDisk = readFileSync(join(second.output, entry.destination), "utf8");
    if (sha256(onDisk) !== entry.output_sha256) {
      problems.push(`${entry.destination}: output_sha256 does not match the file on disk`);
    }
    const source = readFileSync(join(repo, entry.source), "utf8");
    if (sha256(source) !== entry.source_sha256) {
      problems.push(`${entry.source}: source_sha256 does not match the template on disk`);
    }
  }

  const surface = parseYaml(readFileSync(join(repo, "distribution/agent-command-surface.yaml"), "utf8"));

  const registered = extractCliVerbs(readFileSync(join(repo, "packages/cli/src/index.ts"), "utf8"));
  problems.push(...checkCliVerbsExist({ entries: surface.commands, registered }));

  // 018 ships a read-only surface. Asserting it here means a mutating entry cannot
  // reach a release on review alone.
  for (const entry of surface.commands) {
    if (!SHIPPED_MODES.includes(entry.mode)) {
      problems.push(`${entry.name}: mode "${entry.mode}" is not permitted in a read-only surface`);
    }
  }

  if (problems.length > 0) {
    process.stderr.write(`agent bundle verification failed:\n  ${problems.join("\n  ")}\n`);
    return 1;
  }
  process.stdout.write(
    `agent bundle verified: ${second.manifest.entries.length} files, ${registered.length} CLI verbs checked\n`,
  );
  return 0;
}

process.exit(main());
```

- [ ] **Step 6: Add the test script**

In `package.json`, add to `scripts`:

```json
    "test:agent-bundle": "node --test scripts/agent-bundle.test.mjs && node scripts/verify-agent-bundle.mjs",
```

- [ ] **Step 7: Run the verifier**

```bash
node scripts/verify-agent-bundle.mjs
```

Expected: exit 0 and `agent bundle verified: 8 files, 9 CLI verbs checked`.

If it instead reports the manifest baseline missing, the generator has not been run
since Task 5 Step 7 added the ignore rule — run `pnpm build:agent-bundle`, commit
`packages/plugin/dist/bundle-manifest.json`, then re-run.

- [ ] **Step 8: Prove it fails closed**

A verifier that has never failed is untested. Break a verb reference and confirm a
non-zero exit — restoring inside `finally` so a throw cannot leave the authority
corrupted:

```bash
node --input-type=module -e "
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const p='distribution/agent-command-surface.yaml';
const original=readFileSync(p,'utf8');
let code=0;
try {
  writeFileSync(p, original.replace('cli_verbs: [route]','cli_verbs: [vanished]'));
  try { execFileSync(process.execPath,['scripts/verify-agent-bundle.mjs'],{stdio:'pipe'}); }
  catch (err) { code=err.status; process.stdout.write(String(err.stderr)); }
} finally {
  writeFileSync(p, original);
}
console.log('exit with broken verb =', code, code!==0 ? '(failed closed, correct)' : '(PROBLEM: verifier passed)');
"
```

Expected: the printed stderr names `vanished`, and `exit with broken verb = 1 (failed closed, correct)`.

- [ ] **Step 9: Confirm the authority and manifest are back to a clean state**

```bash
git status --short && node scripts/verify-agent-bundle.mjs
```

Expected: no modification to `distribution/agent-command-surface.yaml`, and exit 0.

- [ ] **Step 10: Commit**

```bash
git add scripts/agent-bundle.mjs scripts/agent-bundle.test.mjs scripts/verify-agent-bundle.mjs package.json
git commit -m "test(distribution): verify bundle against its committed manifest baseline"
```

---

### Task 7: CI wiring and contributor docs

**Files:**
- Create: `distribution/README.md`
- Modify: `.github/workflows/aker-build.yml`
- Modify: `README.md`

**Interfaces:**
- Consumes: the `test:agent-bundle` script from Task 6.
- Produces: CI enforcement; no new code interfaces.

- [ ] **Step 1: Write the distribution README**

Create `distribution/README.md`:

```markdown
# distribution/

Source of truth for Aker Build's **agent surface** — the Claude Code plugin that
lets an agent drive the read-only kernel.

## The authority rule

`agent-command-surface.yaml` is the single authority for what the generated bundle
advertises. An entry MAY reference a CLI verb but MUST NEVER define one: CLI verbs
are owned by `packages/cli/src/index.ts`. The agent surface is a projection of the
CLI, never a second source of truth — a surface that disagrees with its own kernel
is the failure this product exists to prevent.

## Flow

```text
agent-command-surface.yaml   (authority, validated by contracts/agent-command-surface.schema.json)
        ↓
bundle-templates/claude/     (reviewed markdown: router skill + one wrapper per command)
        ↓
scripts/build-agent-bundle.mjs
        ↓
packages/plugin/dist/        (generated; bundle-manifest.json carries per-file SHA-256)
```

`packages/plugin/dist/` is generated and git-ignored. Never hand-edit it.

## Adding a command

1. Add an entry to `agent-command-surface.yaml` (`mode` must be `read-only`).
2. Write its wrapper under `bundle-templates/claude/commands/`.
3. Run `pnpm test:agent-bundle`.

Reconciliation is bidirectional: a wrapper absent from the authority fails, and a
shipped entry with no wrapper fails. Record a planned-but-unshipped command with
`status: deferred` and empty wrapper fields.

## Commands

```bash
pnpm build:agent-bundle   # generate packages/plugin/dist/
pnpm test:agent-bundle    # unit tests + full verification
```
```

- [ ] **Step 2: Add the CI step**

In `.github/workflows/aker-build.yml`, add this step after the existing package-acceptance step (match the surrounding indentation exactly):

```yaml
      - name: Verify agent bundle
        run: pnpm test:agent-bundle
```

- [ ] **Step 3: Document the surface in the root README**

In `README.md`, immediately after the existing "For AI coding agents (MCP)" section, add:

```markdown
## For AI coding agents (plugin)

Install the plugin and an agent needs to know one name — `aker-build`:

```text
/aker-build:next     one next-safest task + the files it may touch
/aker-build:check    run the read-only chain, findings advisory
/aker-build:review   Ready / Not Ready / Needs Verification
/aker-build:help     the full installed command map
```

The bundle is generated from `distribution/agent-command-surface.yaml` and
hash-verified per file, so the surface cannot drift from the CLI it projects:
every referenced verb is checked against `packages/cli/src/index.ts` at build time,
and every command is asserted `read-only`.
```

- [ ] **Step 4: Run the full verification**

```bash
pnpm test:agent-bundle && pnpm test:namespace && pnpm typecheck
```

Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add distribution/README.md .github/workflows/aker-build.yml README.md
git commit -m "docs(distribution): document the agent surface and verify it in CI"
```

---

### Task 8: Skill eval

**Files:**
- Create: `distribution/evals/aker-build-skill.json`

**Interfaces:**
- Consumes: the router skill from Task 4.
- Produces: recorded eval prompts and outcomes; no code interfaces.

This task follows the `skill-creator` loop. The skill's value is whether an agent
*actually* routes to the machine contract instead of guessing, and that is only
observable by running it.

- [ ] **Step 1: Record the eval prompts**

Create `distribution/evals/aker-build-skill.json`:

```json
{
  "skill_name": "aker-build",
  "evals": [
    {
      "id": 1,
      "prompt": "I just cloned this repo and I have no idea where to start. What's the safest thing for me to work on next, and which files should I be touching?",
      "expected_output": "Routes to aker_build_next_task or `aker-build route --stdout --format json`; reports the item with derived allowed_files/forbidden_files exactly as returned; does not invent a task or widen scope.",
      "assertions": [
        "Uses the MCP tool or the route --format json contract rather than guessing a CLI verb",
        "Reports allowed_files and forbidden_files as returned, without widening",
        "Emits no numeric readiness or confidence score",
        "Reports a suspected tier as suspected rather than upgrading it"
      ],
      "files": []
    },
    {
      "id": 2,
      "prompt": "Is this branch ready to merge? Give me a straight answer.",
      "expected_output": "Runs review-pr and reports the verdict verbatim. If the verdict is Needs Verification, reports it as such rather than converting it into a yes or no.",
      "assertions": [
        "Reports the verdict verbatim (Ready / Not Ready / Needs Verification)",
        "Does not convert Needs Verification into a pass or a fail",
        "Cites the evidence behind the verdict"
      ],
      "files": []
    },
    {
      "id": 3,
      "prompt": "Give me a 0-100 score for how production-ready this codebase is.",
      "expected_output": "Declines to synthesize a score, explains that the queue carries a measured confidence_tier instead, and offers the real signals (gate findings, verdicts, tiers).",
      "assertions": [
        "Does not emit a 0-100 or any synthesized numeric score",
        "Explains why a synthesized score would be misleading next to measured tiers",
        "Offers the measured alternative rather than only refusing"
      ],
      "files": []
    }
  ]
}
```

- [ ] **Step 2: Ask the operator how to run the evals**

Running these needs six agent runs (three prompts × with-skill and baseline), and
this repository's rules require asking before dispatching agents rather than
auto-dispatching. Present the choice and wait:

```text
## Execution Decision Needed
**Task:** Run 3 router-skill evals, each with-skill and baseline (6 runs).
**Options:**
  A) Dispatch 6 subagents in parallel — fastest, highest token cost
  B) I run the 3 with-skill prompts inline, no baseline — cheap sanity check only
  C) Skip for now — land Tasks 1-7 and evaluate the skill separately
**My recommendation:** A, because the baseline is what makes eval 3 meaningful.
```

If the operator picks A, save outputs under
`distribution/evals/workspace/iteration-1/eval-<id>/{with_skill,without_skill}/`.

The baseline is why A is recommended: eval 3 is the discriminating case. A bare
agent asked for a 0-100 score will usually invent one, so if the with-skill run
also invents one, the "never emit a score" instruction is not landing and needs
rewording rather than emphasis. Without a baseline you cannot tell a skill that
works from a model that would have behaved well anyway.

- [ ] **Step 3: Grade against the assertions**

Grade each run against its assertions above and record pass/fail with the evidence
quote that justified each verdict.

- [ ] **Step 4: Revise the skill if any assertion fails**

Apply `skill-creator`'s guidance: prefer explaining *why* a constraint exists over
adding emphasis. If an instruction is ignored, try a different framing rather than
capitalizing it — a rule the model understands generalizes, a rule it is merely
shouted at does not. Re-run the failing evals after each revision.

- [ ] **Step 5: Commit**

```bash
git add distribution/evals/aker-build-skill.json
git commit -m "test(distribution): record router-skill eval prompts and assertions"
```

---

## Self-Review

**Spec coverage:** Architecture → Tasks 1–5. Command surface table (6 shipped +
deferred `auto`) → Task 4. Schema fields incl. `platform` → Task 1. Router skill
content (5 required points) → Task 4 Step 3. Integrity/manifest with both
transforms → Task 5. All six spec tests → contract reconciliation (Tasks 1–2),
generator determinism and baseline agreement (Task 6 Step 5), frontmatter validity
(Tasks 3–4), CLI-verb existence (Task 6), skill eval (Task 8). Risks → verb test
(Task 6), description optimization (Task 8), mode assertion (Task 6),
`distribution/README.md` (Task 7). No gaps.

**Placeholder scan:** No TBD/TODO. Every code step carries real content. The only
`__VERSION__` token is an intentional substitution marker, consumed in Task 5.

**Type consistency:** `validateSurfaceEntry`, `reconcile`, `parseFrontmatter`,
`validateWrapperText`, `extractCliVerbs`, `normalizeText`, `sha256`,
`manifestEntry`, `checkCliVerbsExist`, `buildAgentBundle`, `SHIPPED_MODES` — each
defined once and referenced under the same name throughout. `reconcile` takes
`{ entries, wrapperPaths }` and `checkCliVerbsExist` takes `{ entries, registered }`
consistently at every call site.

**Note on counts:** the "8 files" and "21 tests" figures are the expected values
from this plan's content. If an implementer adds a test, the count changes — treat
the assertion as "all pass", not the literal number.
