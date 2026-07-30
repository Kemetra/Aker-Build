# Stage C — Agent-Native MCP Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a coding agent ask Aker Build "what is my next safest task, and what am I allowed to touch?" and get a scoped, evidence-backed answer — over MCP, without the agent knowing the CLI exists.

**Architecture:** A new `packages/mcp` workspace package that adapts the existing non-writing library functions (`deriveQueue`, `route`, `compilePrompt`) to MCP tools. Handlers are pure functions in `tools.ts`, testable without a live client; `bin.ts` does stdio transport wiring only. The package is **not** bundled into the published `aker-build` tarball.

**Tech Stack:** TypeScript, Node.js LTS, pnpm, Vitest, Zod, `@modelcontextprotocol/sdk`.

## Global Constraints

- **The report-only wall holds.** The server exposes advice and computes scope. It does not mutate code, does not commit, does not merge, and **does not execute agents** (`CLAUDE.md` hard rule). Emitting a `settings.json` deny-block is *output*, applied by the user.
- **Never `git add -A` or `git add .`.** Stage named files only.
- **New pattern implies new hard negative** (`CLAUDE.md`): any new detection or scope logic ships with a case proving it stays silent when it should.
- New package must satisfy `pnpm check:namespace`, `pnpm -r typecheck`, and `pnpm -r --no-bail test`.

## Owner approval required before Task 1

**This plan adds a production dependency and changes the lockfile.** `CLAUDE.md`: *"Do not change lockfiles unless package changes are explicitly approved."* Two facts the owner needs:

1. `@modelcontextprotocol/sdk` is a new runtime dependency of `packages/mcp` only.
2. It **cannot** go into the published CLI. `scripts/cli-package.mjs:27` throws if the release manifest declares any dependency, and `build-cli-package.mjs` bundles with esbuild. Spec 017's zero-dependency property is enforced by the verifier, not merely aspirational. Keeping the MCP server in its own unbundled package preserves it.

If the owner declines the dependency, Stage C stops here. There is no zero-dependency path to a spec-compliant MCP server.

## The orchestration decision (settled, with evidence)

Verified empirically before planning: `route("./repo", { out: "./fresh" })` throws
`MissingQueueError — No produced queue at …/queue.json. Run 'aker-build queue' first.`
The same applies to `deriveQueue` (needs `project-map.json` + `risks.json`) and
`compilePrompt` (needs `queue.json`).

So a cold agent call would get an exception, not an answer — which would break the
entire premise.

Three options were considered:

- **(a) Tools run the chain internally** on every call. Makes "ask and receive" literally true, but re-scans the repo per call — expensive, and surprising for a tool an agent may poll.
- **(b) Return a structured "prerequisites not met"** the agent can act on. Cheap and honest, matches the CLI contract, but the agent must then shell out to the CLI — which defeats "without knowing the CLI exists."
- **(c) Explicit refresh tool** the agent calls first. Honest, but pushes orchestration onto the agent, and an agent that forgets gets stale advice silently. Stale advice is the worst outcome of the three.

**Decision: (a), with a freshness guard.** `aker_build_next_task` ensures the chain
has been run and reuses artifacts younger than a TTL, re-deriving only when stale or
absent. This makes the tool cold-callable (the pitch) without re-scanning on every
poll (the cost). Staleness is *reported* in the response, never silently tolerated —
consistent with the coverage-honesty principle.

## File structure

| File | Responsibility | Status |
|---|---|---|
| `packages/mcp/package.json` | Package manifest, SDK dependency, vitest scripts | Create |
| `packages/mcp/tsconfig.json` | Mirrors sibling packages | Create |
| `packages/mcp/vitest.config.ts` | Mirrors sibling packages | Create |
| `packages/mcp/src/ensure.ts` | Freshness guard: run/reuse the chain into an out-dir | Create |
| `packages/mcp/src/tools.ts` | Pure handlers: next-task, prompt, scope | Create |
| `packages/mcp/src/deny-block.ts` | Render a Claude Code `settings.json` deny-block from scope | Create |
| `packages/mcp/src/index.ts` | Public surface | Create |
| `packages/mcp/src/bin.ts` | stdio transport wiring only | Create |
| `packages/mcp/tests/*.test.ts` | Vitest against handlers directly | Create |
| `README.md` | MCP section — positioned around the queue, not the transport | Modify |

---

### Task 1: Package scaffold and SDK verification

**Files:**
- Create: `packages/mcp/package.json`, `packages/mcp/tsconfig.json`, `packages/mcp/vitest.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a workspace package named `@aker-build/mcp` that `pnpm -r` picks up.

- [ ] **Step 1: Verify the SDK's current API before writing any handler**

Do not copy registration patterns from memory. `server.tool()` (positional) and
`server.registerTool()` (object) have both existed in `@modelcontextprotocol/sdk`.

**RESOLVED (verified against the installed `.d.ts`, not documentation):**

- Version: **1.30.0**, pinned exactly.
- `server.tool(...)` is **deprecated in every overload**. The current API is
  `registerTool(name, config, cb)` where config is
  `{ title?, description?, inputSchema?, outputSchema?, annotations?, _meta? }`
  and `inputSchema` is a Zod raw shape (a plain object of Zod validators, not a
  wrapped `z.object`).
- Transport: `new StdioServerTransport()` (zero-arg), then
  `await server.connect(transport)`.
- Imports resolve via subpath exports: `@modelcontextprotocol/sdk/server/mcp.js`
  and `@modelcontextprotocol/sdk/server/stdio.js`.

This is why the step exists: `tool()` is what most tutorials still show, and it
would have compiled, run, and been deprecated from day one.

- [ ] **Step 2: Copy a sibling's tsconfig and vitest config**

Run: `cat packages/queue/tsconfig.json packages/queue/vitest.config.ts`

Create the same files under `packages/mcp/`, adjusting only paths. Follow the
existing pattern rather than inventing configuration.

- [ ] **Step 3: Write the package manifest**

Create `packages/mcp/package.json` mirroring `packages/queue/package.json`'s shape.
Dependencies: `@aker-build/queue`, `@aker-build/prompt`, `@aker-build/scanner`,
`@aker-build/gates` (all `workspace:*`), plus the pinned SDK version from Step 1.

- [ ] **Step 4: Verify the workspace picks it up and stays green**

Run: `pnpm install && pnpm check:namespace && pnpm -r typecheck`
Expected: PASS. `pnpm-lock.yaml` changes — this is the approved lockfile change.

- [ ] **Step 5: Verify the published CLI artifact is unaffected**

Run: `pnpm test:cli-package`
Expected: PASS, and the release manifest still declares zero dependencies. If this
fails, the MCP package has leaked into the bundle — stop and fix before continuing.

- [ ] **Step 6: Commit**

```bash
git add packages/mcp/package.json packages/mcp/tsconfig.json packages/mcp/vitest.config.ts pnpm-lock.yaml
git commit -m "build(mcp): scaffold the agent-native MCP package"
```

---

### Task 2: Freshness guard (`ensure.ts`)

Makes the tools cold-callable without re-scanning on every call.

**Files:**
- Create: `packages/mcp/src/ensure.ts`
- Test: `packages/mcp/tests/ensure.test.ts`

**Interfaces:**
- Consumes: `scan`/`gates` entry points as the CLI uses them, plus `deriveQueueToFile` from `@aker-build/queue`.
- Produces: `ensureChain(target: string, opts?: { out?: string; ttlMs?: number }): { out: string; refreshed: boolean; ageMs: number }`. Later tasks call this before reading artifacts.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ensureChain } from "../src/ensure.js";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "aker-mcp-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), `{"name":"t","dependencies":{"express":"^4"}}`);
  writeFileSync(join(root, "src/a.ts"), `app.get("/admin/x", (q, r) => r.json({}));\n`);
  return root;
}

describe("ensureChain", () => {
  it("derives the chain when no artifacts exist", () => {
    const root = repo();
    const res = ensureChain(root, { out: join(root, ".out") });
    expect(res.refreshed).toBe(true);
    expect(res.ageMs).toBe(0);
  });

  it("reuses artifacts younger than the ttl", () => {
    const root = repo();
    const out = join(root, ".out");
    ensureChain(root, { out });
    const res = ensureChain(root, { out, ttlMs: 60_000 });
    expect(res.refreshed).toBe(false);
  });

  it("re-derives when artifacts are older than the ttl", () => {
    const root = repo();
    const out = join(root, ".out");
    ensureChain(root, { out });
    const stale = new Date(Date.now() - 3_600_000);
    utimesSync(join(out, "queue.json"), stale, stale);
    const res = ensureChain(root, { out, ttlMs: 1_000 });
    expect(res.refreshed).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @aker-build/mcp test -- ensure`
Expected: FAIL — `ensureChain is not a function`.

- [ ] **Step 3: Implement `ensureChain`**

`packages/cli/src/index.ts:13` already exports `runCheck`, which sequences
scan → gates → queue → route. **Call it — do not reimplement the chain.** A second
implementation of the sequence would drift from the CLI's and produce different
advice through a different door, which is the worst possible failure for a tool
whose whole claim is a single source of truth. Add `@aker-build/cli` to the
package's `workspace:*` dependencies for this. Key behaviours:

- If `queue.json` is absent → run the chain, return `{ refreshed: true, ageMs: 0 }`.
- If present and `mtime` age ≤ `ttlMs` (default 300_000) → reuse, return `{ refreshed: false, ageMs }`.
- If present and older → re-run, return `{ refreshed: true, ageMs: 0 }`.
- Default `out` is `.aker-build` under the target repo, matching the CLI.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @aker-build/mcp test -- ensure`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/ensure.ts packages/mcp/tests/ensure.test.ts
git commit -m "feat(mcp): add the freshness guard that makes tools cold-callable"
```

---

### Task 3: The `next_task` tool

The moat. Not the transport — this is the answer nobody else returns.

**Files:**
- Create: `packages/mcp/src/tools.ts`
- Test: `packages/mcp/tests/next-task.test.ts`

**Interfaces:**
- Consumes: `ensureChain` (Task 2); `route` from `@aker-build/queue`.
- Produces: `nextTask(target: string, opts?: { out?: string; ttlMs?: number }): NextTaskResult` where `NextTaskResult` is `{ item: { id: string; title: string; type: string; score: number } | null; reason: string | null; allowed_files: string[]; forbidden_files: string[]; evidence: Array<{ path: string; line: number | null; signal: string; confidence: string }>; freshness: { refreshed: boolean; age_ms: number } }`. Task 4 and Task 5 both consume this shape.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nextTask } from "../src/tools.js";

function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "aker-mcp-nt-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), `{"name":"t","dependencies":{"express":"^4"}}`);
  writeFileSync(join(root, "src/a.ts"), `app.get("/admin/x", (q, r) => r.json({}));\n`);
  return root;
}

describe("nextTask", () => {
  it("answers a cold call without the caller running the CLI first", () => {
    const res = nextTask(repo());
    expect(res.item).not.toBeNull();
    expect(res.freshness.refreshed).toBe(true);
  });

  it("returns scope the agent can act on", () => {
    const res = nextTask(repo());
    expect(Array.isArray(res.allowed_files)).toBe(true);
    expect(Array.isArray(res.forbidden_files)).toBe(true);
  });

  it("explains itself when no safe task exists rather than returning a bare null", () => {
    const empty = mkdtempSync(join(tmpdir(), "aker-mcp-empty-"));
    writeFileSync(join(empty, "package.json"), `{"name":"e"}`);
    const res = nextTask(empty);
    if (res.item === null) expect(res.reason).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @aker-build/mcp test -- next-task`
Expected: FAIL — `nextTask is not a function`.

- [ ] **Step 3: Implement `nextTask`**

Call `ensureChain`, then `route` (the non-writing variant). Map the `RouterDecision`
to `NextTaskResult`. When no safe task exists, populate `reason` from the decision's
`no_safe_task_reasons` — never return a bare `null` with no explanation.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @aker-build/mcp test -- next-task`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools.ts packages/mcp/tests/next-task.test.ts
git commit -m "feat(mcp): add next_task, the cold-callable routing answer"
```

---

### Task 4: The `compile_prompt` tool and the deny-block emitter

**Files:**
- Modify: `packages/mcp/src/tools.ts`
- Create: `packages/mcp/src/deny-block.ts`
- Test: `packages/mcp/tests/deny-block.test.ts`

**Interfaces:**
- Consumes: `NextTaskResult` (Task 3); `compilePrompt` from `@aker-build/prompt`.
- Produces: `compileFor(target: string, id: string, agent?: string): { markdown: string }` and `denyBlock(forbidden: string[]): { permissions: { deny: string[] } }`.

- [ ] **Step 1: Write the failing test for the deny-block**

```typescript
import { describe, it, expect } from "vitest";
import { denyBlock } from "../src/deny-block.js";

describe("denyBlock", () => {
  it("renders forbidden paths as Claude Code deny rules", () => {
    expect(denyBlock(["migrations/**", "infra/secrets.ts"])).toEqual({
      permissions: { deny: ["Read(./migrations/**)", "Edit(./migrations/**)", "Read(./infra/secrets.ts)", "Edit(./infra/secrets.ts)"] },
    });
  });

  it("returns an empty deny list rather than a wildcard when nothing is forbidden", () => {
    // A wildcard here would deny everything — failing closed in the harmful direction.
    expect(denyBlock([])).toEqual({ permissions: { deny: [] } });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @aker-build/mcp test -- deny-block`
Expected: FAIL — `denyBlock is not a function`.

- [ ] **Step 3: Implement `denyBlock` and `compileFor`**

```typescript
/**
 * Render forbidden paths as a Claude Code settings.json deny-block. Aker Build computes the
 * boundary; the platform's deny-first permission engine enforces it — a mechanical guarantee an
 * advisory prompt cannot make.
 *
 * Caveat that must ship with this: deny rules govern the agent's own file tools. They do not
 * constrain arbitrary subprocesses, so this is "stronger than a prompt", not "airtight".
 */
export function denyBlock(forbidden: string[]): { permissions: { deny: string[] } } {
  const deny = forbidden.flatMap((p) => [`Read(./${p})`, `Edit(./${p})`]);
  return { permissions: { deny } };
}
```

`compileFor` calls `ensureChain` then `compilePrompt` (non-writing), returning the markdown.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @aker-build/mcp test -- deny-block`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/tools.ts packages/mcp/src/deny-block.ts packages/mcp/tests/deny-block.test.ts
git commit -m "feat(mcp): add compile_prompt and the settings.json deny-block emitter"
```

---

### Task 5: stdio transport wiring

Thin by design. All logic lives in Tasks 2–4 so it is testable without a client.

**Files:**
- Create: `packages/mcp/src/index.ts`, `packages/mcp/src/bin.ts`

**Interfaces:**
- Consumes: `nextTask`, `compileFor`, `denyBlock`.
- Produces: an executable stdio MCP server.

- [ ] **Step 1: Write the public surface**

`index.ts` re-exports `nextTask`, `compileFor`, `denyBlock`, `ensureChain` and their types, matching the sibling packages' export style.

- [ ] **Step 2: Wire the server using the API verified in Task 1**

Register three tools with Zod input schemas, using the **exact** signatures resolved
in Task 1 Step 1:

- `aker_build_next_task` — "Return the next safest task for an AI agent to attempt in this repository, with the files it may and may not touch. Read-only."
- `aker_build_compile_prompt` — "Compile a safe, scoped prompt for a queue item."
- `aker_build_deny_block` — "Render the forbidden-file set as a Claude Code settings.json deny-block."

Tool descriptions matter: they are what the model reads to decide when to call.
Each must say the tool is read-only.

- [ ] **Step 3: Verify the server starts and lists its tools**

Run: `echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | pnpm dlx tsx packages/mcp/src/bin.ts`
Expected: a JSON-RPC response listing the three tools. If the process hangs or errors,
the transport wiring is wrong — fix before continuing.

- [ ] **Step 4: Run the full suite**

Run: `pnpm -r --no-bail test && pnpm -r typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/mcp/src/index.ts packages/mcp/src/bin.ts
git commit -m "feat(mcp): wire the stdio transport"
```

---

### Task 6: Document it, positioned around the queue

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the MCP section**

Lead with what the agent *asks*, not with the fact that an MCP server exists.
CodeScene's MCP already exposes PR review and debt prioritization, so "we have an
MCP server" is a transport claim, not a differentiator. What is unoccupied is
**queue derivation by agent-safety** and **scope computed from a scan**.

Include the honest caveat: deny rules govern the agent's file tools, not arbitrary
subprocesses.

- [ ] **Step 2: Verify the documented invocation actually works**

Run the command exactly as written in the README, from a clean shell.
Expected: it works as documented. A quickstart that does not run is worse than none.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document the MCP server around the queue, not the transport"
```

---

## Stage C exit criteria

- [ ] An agent completes a cold ask → routed task → scoped prompt loop over MCP, without the caller running the CLI first.
- [ ] `pnpm test:cli-package` still passes: the published tarball declares zero dependencies.
- [ ] Full suite and typecheck green across all packages.
- [ ] Deny-block emitter ships with its subprocess caveat in both code and docs.
- [ ] README leads with the queue, not the transport.

## Out of scope

Executing agents (constitution hard rule), mutation of any kind, HTTP/remote
transport (stdio only until there is a consumer), bundling the MCP server into the
published CLI, and the hosted dashboard.
