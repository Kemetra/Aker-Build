import { createHmac } from "node:crypto";
import { describe, it, expect, vi, afterEach } from "vitest";
import type { Workspace } from "@tenantguard/github-app";
import { dispatch, type DispatchDeps } from "../src/server.js";
import type { GitHubApi } from "../src/github-api.js";
import { handleRequest } from "../src/http-server.js";
import { makeAuthToken } from "../src/auth.js";
import { makeGitWorkspace, type GitRunner } from "../src/git-workspace.js";

const SECRET = "WEBHOOK-SECRET-SENTINEL";
const TOKEN = "ghs_INSTALLATION_TOKEN_SENTINEL";
const sign = (b: string) => `sha256=${createHmac("sha256", SECRET).update(b).digest("hex")}`;

const body = (over: Record<string, unknown> = {}) =>
  JSON.stringify({
    action: "opened",
    pull_request: { number: 7, draft: false, head: { sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" } },
    repository: { owner: { login: "org" }, name: "repo" },
    installation: { id: 1 },
    ...over,
  });

const ws: Workspace = { async checkout() { return "/tmp/x"; }, async dispose() {} };

/** An octokit-shaped error: the thrown object carries an Authorization header in its request config. */
function authBearingError(): Error {
  const err = new Error("HttpError: 403") as Error & { request?: unknown };
  err.request = { headers: { authorization: `token ${TOKEN}` } };
  return err;
}

const sentinels = [SECRET, TOKEN];
function assertNoSentinel(s: string) {
  for (const sec of sentinels) expect(s).not.toContain(sec);
}

afterEach(() => vi.restoreAllMocks());

describe("secret safety across all paths (US2 / SC-003)", () => {
  it("a Checks-API error carrying an auth header never leaks the token into the result or logs", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a) => logs.push(a.join(" ")));
    vi.spyOn(console, "warn").mockImplementation((...a) => logs.push(a.join(" ")));

    const api: GitHubApi = {
      async listChangedFiles() { return ["a.ts"]; },
      async getPrMetadata() { return { title: "t", state: "open", baseRefName: "main" }; },
      async findCheckRun() { return null; },
      async createCheckRun() { throw authBearingError(); },
      async updateCheckRun() {},
    };

    const deps: DispatchDeps = { api, workspace: ws, webhookSecret: SECRET };
    const res = await dispatch(body(), sign(body()), deps);

    // Boundary returns a secret-free 502; nothing logged contains a sentinel.
    expect(res.status).toBe(502);
    assertNoSentinel(JSON.stringify(res));
    assertNoSentinel(logs.join("\n"));
  });

  it("the happy-path result (payload) never contains a credential value", async () => {
    const api: GitHubApi = {
      async listChangedFiles() { return ["a.ts"]; },
      async getPrMetadata() { return { title: "t", state: "open", baseRefName: "main" }; },
      async findCheckRun() { return null; },
      async createCheckRun() { return { id: 1 }; },
      async updateCheckRun() {},
    };
    const res = await dispatch(body(), sign(body()), { api, workspace: ws, webhookSecret: SECRET });
    assertNoSentinel(JSON.stringify(res));
  });

  it("a rejected (bad-signature) request leaks nothing", async () => {
    const api: GitHubApi = {
      async listChangedFiles() { return []; },
      async getPrMetadata() { return { title: "", state: "", baseRefName: "" }; },
      async findCheckRun() { return null; },
      async createCheckRun() { return { id: 1 }; },
      async updateCheckRun() {},
    };
    const res = await dispatch(body(), "sha256=wrong", { api, workspace: ws, webhookSecret: SECRET });
    expect(res.status).toBe(401);
    assertNoSentinel(JSON.stringify(res));
  });
});

const PEM = "-----BEGIN RSA PRIVATE KEY-----\nPRIVATE-KEY-SENTINEL\n-----END RSA PRIVATE KEY-----";

/** A git runner whose stderr embeds the live token — the path most likely to leak it. */
const tokenLeakingGit: GitRunner = {
  run() {
    return { stdout: "", stderr: `fatal: could not read with ${TOKEN}`, code: 128 };
  },
};

describe("secret safety on the LIVE-EDGE surfaces (HTTP entrypoint + real workspace token)", () => {
  it("checkout failure with the token in git stderr never surfaces it (WorkspaceError + neutral)", async () => {
    const logs: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a) => logs.push(a.join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a) => logs.push(a.join(" ")));

    let posted = "";
    const api: GitHubApi = {
      async listChangedFiles() { return ["a.ts"]; },
      async getPrMetadata() { return { title: "t", state: "open", baseRefName: "main" }; },
      async findCheckRun() { return null; },
      async createCheckRun(args) { posted = JSON.stringify(args.payload); return { id: 1 }; },
      async updateCheckRun() {},
    };
    // Real workspace: token minted (sentinel), git fails with the token in stderr.
    const workspace = makeGitWorkspace({
      git: tokenLeakingGit,
      authToken: makeAuthToken({
        creds: { appId: "1", privateKey: PEM, webhookSecret: SECRET },
        installationId: 1,
        mint: async () => TOKEN,
      }),
    });
    const deps: DispatchDeps = { api, workspace, webhookSecret: SECRET };

    const res = await handleRequest(body(), sign(body()), deps);

    // Checkout failed → review concluded neutral → check still posted (200, not success).
    expect(res.status).toBe(200);
    assertNoSentinel(posted);
    expect(posted).not.toContain("PRIVATE-KEY-SENTINEL");
    assertNoSentinel(logs.join("\n"));
    assertNoSentinel(JSON.stringify(res));
  });

  it("the HTTP-mapped 502 body on a Checks failure carries no credential value", async () => {
    const api: GitHubApi = {
      async listChangedFiles() { return ["a.ts"]; },
      async getPrMetadata() { return { title: "t", state: "open", baseRefName: "main" }; },
      async findCheckRun() { return null; },
      async createCheckRun() { throw authBearingError(); },
      async updateCheckRun() {},
    };
    const res = await handleRequest(body(), sign(body()), { api, workspace: ws, webhookSecret: SECRET });
    expect(res.status).toBe(502);
    assertNoSentinel(res.body);
  });
});
