import { createHmac } from "node:crypto";
import { Readable } from "node:stream";
import { describe, it, expect } from "vitest";
import type { Workspace } from "@tenantguard/github-app";
import type { GitHubApi } from "../src/github-api.js";
import type { DispatchDeps } from "../src/server.js";
import { handleRequest, readBody, MAX_BODY_BYTES, composeDeps } from "../src/http-server.js";

const SECRET = "webhook-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;

const rawEvent = JSON.stringify({
  action: "opened",
  pull_request: { number: 42, draft: false, head: { sha: "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678" } },
  repository: { owner: { login: "org" }, name: "repo" },
  installation: { id: 99 },
});

function fakeApi(): GitHubApi {
  return {
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
      return { id: 1 };
    },
    async updateCheckRun() {},
  };
}

const fakeWorkspace: Workspace = {
  async checkout() {
    return "/tmp/ephemeral";
  },
  async dispose() {},
};

const deps = (): DispatchDeps => ({ api: fakeApi(), workspace: fakeWorkspace, webhookSecret: SECRET });

describe("readBody — raw bytes + oversize guard", () => {
  it("reads the raw body bytes unchanged (HMAC integrity)", async () => {
    const req = Readable.from([Buffer.from(rawEvent)]);
    const body = await readBody(req, MAX_BODY_BYTES);
    expect(body).toBe(rawEvent); // byte-for-byte; no parse/restringify
  });

  it("rejects an oversize body before buffering it all (413)", async () => {
    const huge = "x".repeat(MAX_BODY_BYTES + 10);
    const req = Readable.from([Buffer.from(huge)]);
    await expect(readBody(req, MAX_BODY_BYTES)).rejects.toThrow(/too large/i);
  });
});

describe("handleRequest — DispatchResult → HTTP status", () => {
  it("a signed reviewable event → 200", async () => {
    const res = await handleRequest(rawEvent, sign(rawEvent), deps());
    expect(res.status).toBe(200);
  });

  it("a missing/invalid signature → 401", async () => {
    const res = await handleRequest(rawEvent, "sha256=bad", deps());
    expect(res.status).toBe(401);
  });

  it("a non-reviewable action → 202", async () => {
    const closed = JSON.stringify({ ...JSON.parse(rawEvent), action: "closed" });
    const res = await handleRequest(closed, sign(closed), deps());
    expect(res.status).toBe(202);
  });

  it("a Checks-API failure → 502 (not an uncaught throw)", async () => {
    const failingDeps: DispatchDeps = {
      ...deps(),
      api: {
        ...fakeApi(),
        async createCheckRun(): Promise<{ id: number }> {
          throw new Error("rate limited");
        },
      },
    };
    const res = await handleRequest(rawEvent, sign(rawEvent), failingDeps);
    expect(res.status).toBe(502);
  });
});

describe("composeDeps — the composition root (guards always-neutral at the REAL layer)", () => {
  // composeDeps is the ONLY production code that wires `prepareRepo` into DispatchDeps. Every other
  // test injects `prepareRepo` by hand, so deleting it from composeDeps would regress production to
  // the always-neutral defect while those tests stay green (reviewer MEDIUM). This test pins the
  // composition root itself, where the bug actually reappears.
  const fakeEnv = {
    TENANTGUARD_APP_ID: "123456",
    // A minimal RSA-looking key — octokit's auth is lazy, so construction never validates it here.
    TENANTGUARD_APP_PRIVATE_KEY: "-----BEGIN RSA PRIVATE KEY-----\nMIIBnotreal\n-----END RSA PRIVATE KEY-----",
    TENANTGUARD_WEBHOOK_SECRET: "whsec",
    TENANTGUARD_INSTALLATION_ID: "99",
  };

  it("wires prepareRepo so the live review actually scans the checkout (not always-neutral)", () => {
    const deps = composeDeps(fakeEnv);
    expect(typeof deps.prepareRepo).toBe("function"); // the always-neutral guard, at the real layer
  });

  it("threads the env webhook secret and a real api + workspace into the deps", () => {
    const deps = composeDeps(fakeEnv);
    expect(deps.webhookSecret).toBe("whsec");
    expect(typeof deps.api.createCheckRun).toBe("function");
    expect(typeof deps.workspace.checkout).toBe("function");
  });

  it("fails fast (without leaking a value) when a required credential is missing", () => {
    const { TENANTGUARD_APP_PRIVATE_KEY: _omitted, ...missingKey } = fakeEnv;
    expect(() => composeDeps(missingKey)).toThrow(/TENANTGUARD_APP_PRIVATE_KEY/);
  });
});
