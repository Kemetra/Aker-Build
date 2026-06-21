import { createHmac } from "node:crypto";
import { afterEach, describe, it, expect } from "vitest";
import type { Server } from "node:http";
import type { Workspace } from "@tenantguard/github-app";
import type { GitHubApi } from "../src/github-api.js";
import { start, MAX_BODY_BYTES } from "../src/http-server.js";
import type { DispatchDeps } from "../src/server.js";

/**
 * FORTIFICATION (advisor #5): exercise the REAL `start()` socket shell over a real ephemeral server
 * (port 0) with real HTTP requests — the 413 oversize branch and the generic-500 branch are otherwise
 * untested, and the 500 branch is secret-safety-relevant (it must not surface error internals).
 */
const SECRET = "webhook-secret";
const sign = (b: string) => `sha256=${createHmac("sha256", SECRET).update(b).digest("hex")}`;

const servers: Server[] = [];
afterEach(() => {
  for (const s of servers.splice(0)) s.close();
});

function listen(deps: DispatchDeps): Promise<string> {
  const server = start(deps, 0); // port 0 → OS-assigned ephemeral port
  servers.push(server);
  return new Promise((resolve) => {
    server.on("listening", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve(`http://127.0.0.1:${port}`);
    });
  });
}

function okApi(): GitHubApi {
  return {
    async listChangedFiles() { return ["a.ts"]; },
    async getPrMetadata() { return { title: "t", state: "open", baseRefName: "main" }; },
    async findCheckRun() { return null; },
    async createCheckRun() { return { id: 1 }; },
    async updateCheckRun() {},
  };
}
const okWorkspace: Workspace = { async checkout() { return "/tmp/x"; }, async dispose() {} };

const reviewable = JSON.stringify({
  action: "opened",
  pull_request: { number: 7, draft: false, head: { sha: "a".repeat(40) } },
  repository: { owner: { login: "o" }, name: "r" },
  installation: { id: 1 },
});

describe("start() default-composition path (the chain bin.ts actually fires)", () => {
  it("zero-arg start() in a creds-free env fails fast via composeDeps()→loadCredentials, before any socket/network", () => {
    // bin.ts calls `start()` with NO args → the default param `composeDeps()` runs against the
    // environment. Every other test passes explicit deps, so this default chain is otherwise never
    // exercised. Here we prove it reaches loadCredentials and fails fast (naming the var, no value
    // printed) WITHOUT binding a port or making a network call — it throws synchronously as the
    // default argument evaluates, before `listen` is reached.
    const saved = {
      TENANTGUARD_APP_ID: process.env.TENANTGUARD_APP_ID,
      TENANTGUARD_APP_PRIVATE_KEY: process.env.TENANTGUARD_APP_PRIVATE_KEY,
      TENANTGUARD_WEBHOOK_SECRET: process.env.TENANTGUARD_WEBHOOK_SECRET,
      TENANTGUARD_INSTALLATION_ID: process.env.TENANTGUARD_INSTALLATION_ID,
    };
    delete process.env.TENANTGUARD_APP_ID;
    delete process.env.TENANTGUARD_APP_PRIVATE_KEY;
    delete process.env.TENANTGUARD_WEBHOOK_SECRET;
    delete process.env.TENANTGUARD_INSTALLATION_ID;
    try {
      // Names a missing required credential; never prints a value (FR-007). Throwing here proves the
      // default-composition path is wired end-to-end up to credential loading.
      expect(() => start(undefined, 0)).toThrow(/TENANTGUARD_/);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("start() real socket shell", () => {
  it("a non-POST method → 405", async () => {
    const base = await listen({ api: okApi(), workspace: okWorkspace, webhookSecret: SECRET });
    const res = await fetch(base, { method: "GET" });
    expect(res.status).toBe(405);
  });

  it("an oversize body → 413 with a secret-free error, no processing", async () => {
    const base = await listen({ api: okApi(), workspace: okWorkspace, webhookSecret: SECRET });
    const huge = "x".repeat(MAX_BODY_BYTES + 100);
    const res = await fetch(base, { method: "POST", body: huge, headers: { "x-hub-signature-256": sign(huge) } });
    expect(res.status).toBe(413);
    expect(await res.text()).toContain("body_too_large");
  });

  it("a signed reviewable POST → 200 (full real request path)", async () => {
    const base = await listen({ api: okApi(), workspace: okWorkspace, webhookSecret: SECRET });
    const res = await fetch(base, {
      method: "POST",
      body: reviewable,
      headers: { "x-hub-signature-256": sign(reviewable) },
    });
    expect(res.status).toBe(200);
  });

  it("an unexpected error inside handling → generic 500 that surfaces NO internals (secret-safe)", async () => {
    // Force the rare uncaught path: a verifySignature throw that is NOT a WebhookSignatureError is
    // re-thrown by dispatch → caught by start()'s generic handler → 500. We simulate it via an api
    // whose getter throws synchronously when dispatch touches the deps. Simplest: a webhookSecret
    // accessor that throws a secret-bearing error.
    const SECRET_INTERNAL = "INTERNAL-SECRET-DO-NOT-LEAK-zzz";
    const deps = {
      api: okApi(),
      workspace: okWorkspace,
      get webhookSecret(): string {
        throw new Error(`boom with ${SECRET_INTERNAL}`);
      },
    } as unknown as DispatchDeps;
    const base = await listen(deps);
    const res = await fetch(base, {
      method: "POST",
      body: reviewable,
      headers: { "x-hub-signature-256": sign(reviewable) },
    });
    expect(res.status).toBe(500);
    const text = await res.text();
    expect(text).toContain("internal_error");
    expect(text).not.toContain(SECRET_INTERNAL); // the thrown internal NEVER reaches the response
  });
});
