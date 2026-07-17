import { createHmac } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ChecksPayload, Workspace } from "@aker-build/github-app";
import { dispatch, type DispatchDeps } from "../src/server.js";
import type { GitHubApi } from "../src/github-api.js";

const SECRET = "concurrency-secret";
const roots: string[] = [];

function event(prNumber: number, shaDigit: string): string {
  return JSON.stringify({
    action: "opened",
    pull_request: { number: prNumber, draft: false, base: { sha: "f".repeat(40) }, head: { sha: shaDigit.repeat(40) } },
    repository: { owner: { login: "org" }, name: "repo" },
    installation: { id: 99 },
  });
}

function signature(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe("concurrent dispatch isolation", () => {
  it("uses two distinct checkouts and posts both checks from only their own source", async () => {
    const parent = mkdtempSync(join(tmpdir(), "aker-build-overlap-"));
    roots.push(parent);
    const active = new Set<string>();
    const observed = new Map<string, string>();
    const disposed: string[] = [];
    let checkoutCount = 0;

    const workspace: Workspace = {
      async checkout({ headSha }) {
        checkoutCount += 1;
        const repoRoot = join(parent, `repo-${headSha[0]}-${checkoutCount}`);
        mkdirSync(repoRoot);
        writeFileSync(join(repoRoot, "identity.txt"), headSha);
        active.add(repoRoot);
        observed.set(repoRoot, readFileSync(join(repoRoot, "identity.txt"), "utf8"));
        return repoRoot;
      },
      async dispose(repoRoot) {
        disposed.push(repoRoot);
        active.delete(repoRoot);
        rmSync(repoRoot, { recursive: true, force: true });
      },
    };

    const checks: Array<{ headSha: string; payload: ChecksPayload }> = [];
    const api: GitHubApi = {
      async listChangedFiles() { return []; },
      async getPrMetadata() { return { title: "PR", state: "open", baseRefName: "main" }; },
      async findCheckRun() { return null; },
      async createCheckRun(args) {
        checks.push({ headSha: args.headSha, payload: args.payload });
        return { id: checks.length };
      },
      async updateCheckRun() {},
    };
    const dispatchDeps: DispatchDeps = {
      api,
      workspace,
      webhookSecret: SECRET,
    };
    const first = event(1, "a");
    const second = event(2, "b");
    const results = await Promise.all([
      dispatch(first, signature(first), dispatchDeps),
      dispatch(second, signature(second), dispatchDeps),
    ]);

    expect(results.map((result) => result.status)).toEqual([200, 200]);
    expect(new Set(observed.keys()).size).toBe(4);
    expect([...observed.values()].sort()).toEqual([
      "a".repeat(40),
      "b".repeat(40),
      "f".repeat(40),
      "f".repeat(40),
    ]);
    expect(checks.map((check) => check.headSha).sort()).toEqual(["a".repeat(40), "b".repeat(40)]);
    expect(checks.every((check) => check.payload.conclusion === "neutral")).toBe(true);
    expect(checks.every((check) => check.payload.summary.includes("base_unavailable"))).toBe(true);
    expect(disposed).toHaveLength(4);
    expect([...active]).toEqual([]);
  });
});
