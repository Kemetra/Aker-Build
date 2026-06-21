import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import type { Workspace } from "@tenantguard/github-app";
import { dispatch, type DispatchDeps } from "../src/server.js";
import type { GitHubApi } from "../src/github-api.js";

const SECRET = "webhook-secret";
const sign = (b: string) => `sha256=${createHmac("sha256", SECRET).update(b).digest("hex")}`;

const VALID_SHA = "0".repeat(40);

const fakeWorkspace: Workspace = { async checkout() { return "/tmp/x"; }, async dispose() {} };

function fakeApi(over: Partial<GitHubApi> = {}): GitHubApi & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    async listChangedFiles() { return ["apps/api/admin.ts"]; },
    async getPrMetadata() { return { title: "t", state: "open", baseRefName: "main" }; },
    async findCheckRun() { return null; },
    async createCheckRun() { writes.push("createCheckRun"); return { id: 1 }; },
    async updateCheckRun() { writes.push("updateCheckRun"); },
    ...over,
  };
}

const deps = (api: GitHubApi): DispatchDeps => ({ api, workspace: fakeWorkspace, webhookSecret: SECRET });

describe("honest degradation — signed non-PR / ping / malformed (FR-008/FR-009): NEVER 500", () => {
  it("a signed GitHub `ping` event (no pull_request) → 202 ignored_unparseable, no check, no 500", async () => {
    // GitHub sends `ping` on webhook creation. It has a valid signature but no pull_request → Zod
    // throws. Must be acknowledged, NOT a 500 that makes GitHub redeliver forever.
    const api = fakeApi();
    const ping = JSON.stringify({ zen: "Keep it simple.", hook_id: 1 });
    const res = await dispatch(ping, sign(ping), deps(api));
    expect(res.status).toBe(202);
    if (res.status === 202) expect(res.reason).toBe("ignored_unparseable");
    expect(api.writes).toEqual([]);
  });

  it("a signed but malformed-JSON body → 202, no check, no throw", async () => {
    const api = fakeApi();
    const junk = "{not valid json";
    const res = await dispatch(junk, sign(junk), deps(api));
    expect(res.status).toBe(202);
    expect(api.writes).toEqual([]);
  });

  it("a signed body with a non-hex head sha → 202 (rejected at the schema boundary, not processed)", async () => {
    const api = fakeApi();
    const bad = JSON.stringify({
      action: "opened",
      pull_request: { number: 1, draft: false, head: { sha: "--upload-pack=evil" } },
      repository: { owner: { login: "o" }, name: "r" },
      installation: { id: 1 },
    });
    const res = await dispatch(bad, sign(bad), deps(api));
    expect(res.status).toBe(202);
    expect(api.writes).toEqual([]);
  });
});

describe("honest degradation — GitHub read failure → neutral check, never 500 (FR-010)", () => {
  const reviewable = JSON.stringify({
    action: "opened",
    pull_request: { number: 7, draft: false, head: { sha: VALID_SHA } },
    repository: { owner: { login: "org" }, name: "repo" },
    installation: { id: 1 },
  });

  it("listChangedFiles throwing → posts a neutral check (200), not a 500", async () => {
    const api = fakeApi({
      async listChangedFiles(): Promise<string[]> { throw new Error("rate limited"); },
    });
    const res = await dispatch(reviewable, sign(reviewable), deps(api));
    expect(res.status).toBe(200);
    if (res.status === 200) {
      expect(res.payload.conclusion).toBe("neutral");
      expect(res.payload.summary).not.toContain("rate limited"); // secret/internal-free reason
    }
    expect(api.writes).toEqual(["createCheckRun"]); // the neutral check WAS posted
  });

  it("getPrMetadata throwing → neutral check (200), not 500", async () => {
    const api = fakeApi({
      async getPrMetadata(): Promise<{ title: string; state: string; baseRefName: string }> {
        throw new Error("502 from github");
      },
    });
    const res = await dispatch(reviewable, sign(reviewable), deps(api));
    expect(res.status).toBe(200);
    if (res.status === 200) expect(res.payload.conclusion).toBe("neutral");
  });

  it("if even the neutral-check POST fails → 502 (not an uncaught throw)", async () => {
    const api = fakeApi({
      async listChangedFiles(): Promise<string[]> { throw new Error("rate limited"); },
      async createCheckRun(): Promise<{ id: number }> { throw new Error("also down"); },
    });
    const res = await dispatch(reviewable, sign(reviewable), deps(api));
    expect(res.status).toBe(502);
  });
});
