import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import type { ChecksPayload, Workspace } from "@tenantguard/github-app";
import { dispatch, type DispatchDeps } from "../src/server.js";
import type { GitHubApi } from "../src/github-api.js";

const SECRET = "webhook-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

function body(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: "opened",
    pull_request: { number: 42, draft: false, head: { sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" } },
    repository: { owner: { login: "org" }, name: "repo" },
    installation: { id: 99 },
    ...over,
  });
}

/** A fake GitHubApi: records writes, returns a confirmed finding's inputs via the runner path. */
function fakeApi(over: Partial<GitHubApi> = {}): GitHubApi & { writes: string[] } {
  const writes: string[] = [];
  return {
    writes,
    async listChangedFiles() {
      return ["apps/api/admin.ts"];
    },
    async getPrMetadata() {
      return { title: "t", state: "open", baseRefName: "main" };
    },
    async findCheckRun() {
      return null;
    },
    async createCheckRun() {
      writes.push("createCheckRun");
      return { id: 1 };
    },
    async updateCheckRun() {
      writes.push("updateCheckRun");
    },
    ...over,
  };
}

const fakeWorkspace: Workspace = {
  async checkout() {
    return "/tmp/ephemeral";
  },
  async dispose() {},
};

const deps = (api: GitHubApi, ws: Workspace = fakeWorkspace): DispatchDeps => ({ api, workspace: ws, webhookSecret: SECRET });

describe("dispatch (US1 happy path)", () => {
  it("a signed reviewable event posts a check and returns 200", async () => {
    const api = fakeApi();
    const res = await dispatch(body(), sign(body()), deps(api));
    expect(res.status).toBe(200);
    expect(api.writes).toEqual(["createCheckRun"]);
  });

  it("performs ONLY checks writes — no other GitHub mutation (FR-012/SC-004)", async () => {
    const api = fakeApi();
    await dispatch(body(), sign(body()), deps(api));
    expect(api.writes.every((w) => w === "createCheckRun" || w === "updateCheckRun")).toBe(true);
  });
});

describe("dispatch (US3 honest degradation)", () => {
  it("rejects a missing signature with 401, no GitHub write (FR-008)", async () => {
    const api = fakeApi();
    const res = await dispatch(body(), undefined, deps(api));
    expect(res.status).toBe(401);
    expect(api.writes).toEqual([]);
  });

  it("rejects a wrong signature with 401, no write", async () => {
    const api = fakeApi();
    const res = await dispatch(body(), "sha256=bad", deps(api));
    expect(res.status).toBe(401);
    expect(api.writes).toEqual([]);
  });

  it("acknowledges a non-reviewable action with 202 and no check (FR-009)", async () => {
    const api = fakeApi();
    const b = body({ action: "closed" });
    const res = await dispatch(b, sign(b), deps(api));
    expect(res.status).toBe(202);
    expect(api.writes).toEqual([]);
  });

  it("a Checks-API failure returns 502 at the boundary, not an uncaught throw (advisor #3)", async () => {
    const api = fakeApi({
      async createCheckRun(): Promise<{ id: number }> {
        throw new Error("rate limited");
      },
    });
    const res = await dispatch(body(), sign(body()), deps(api));
    expect(res.status).toBe(502);
  });

  it("a checkout failure still yields a posted check (review concluded neutral)", async () => {
    const api = fakeApi();
    // checkout throws before returning a path; 014's run() has no repoRoot to dispose (the
    // workspace itself cleans up any partial dir — see git-workspace.test.ts). safeRun maps the
    // failure to a neutral payload, which is still posted → 200.
    const ws: Workspace = {
      async checkout() {
        throw new Error("checkout timed out");
      },
      async dispose() {},
    };
    const res = await dispatch(body(), sign(body()), deps(api, ws));
    expect(res.status).toBe(200);
    if (res.status === 200) expect(res.payload.conclusion).toBe("neutral");
  });
});
