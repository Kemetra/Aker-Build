import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import type { Workspace } from "@tenantguard/github-app";
import { loadCredentials, type AppCredentials } from "./config.js";
import { makeGitHubApi, type OctokitLike } from "./octokit-api.js";
import { makeGitWorkspace } from "./git-workspace.js";
import { makeNodeGit } from "./node-git.js";
import { makeAuthToken } from "./auth.js";
import { prepareRepo } from "./prepare-repo.js";
import { dispatch, type DispatchDeps, type DispatchResult } from "./server.js";

/** Max webhook body we will buffer. GitHub deliveries are small; this bounds memory per request. */
export const MAX_BODY_BYTES = 5 * 1024 * 1024; // 5 MiB

const GITHUB_SIGNATURE_HEADER = "x-hub-signature-256";

/**
 * Read the raw request body as a string WITHOUT parsing it. The signature is an HMAC over the exact
 * bytes GitHub sent — parsing then re-stringifying would reorder keys / change whitespace and break
 * verification (advisor). We also enforce a hard size cap mid-stream so an oversized delivery can't
 * exhaust memory before we even verify it (FR-008).
 */
export async function readBody(req: AsyncIterable<Buffer | string>, maxBytes: number): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
    total += buf.length;
    if (total > maxBytes) throw new BodyTooLargeError();
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export class BodyTooLargeError extends Error {
  constructor() {
    super("request body too large");
    this.name = "BodyTooLargeError";
  }
}

/**
 * Pure request handling: given the raw body + signature header, run `dispatch` and map its result to
 * an HTTP status. Separated from the socket so it is unit-testable without binding a port. `dispatch`
 * already returns only secret-free reasons; we never echo credential material.
 */
export async function handleRequest(
  rawBody: string,
  signature: string | undefined,
  deps: DispatchDeps,
): Promise<{ status: number; body: string }> {
  const result: DispatchResult = await dispatch(rawBody, signature, deps);
  switch (result.status) {
    case 200:
      return { status: 200, body: JSON.stringify({ ok: true, checkId: result.checkId }) };
    case 202:
      return { status: 202, body: JSON.stringify({ ok: true, ignored: result.reason }) };
    case 401:
      return { status: 401, body: JSON.stringify({ ok: false, error: result.reason }) };
    case 502:
      return { status: 502, body: JSON.stringify({ ok: false, error: result.reason }) };
  }
}

/**
 * Compose the runtime from env credentials + concrete adapters. The installation id is captured here
 * (single-tenant): an operator sets `TENANTGUARD_INSTALLATION_ID`. Credentials never leave this
 * process; the per-event token is minted transiently by the workspace and discarded.
 */
export function composeDeps(env: Record<string, string | undefined> = process.env): DispatchDeps {
  const creds: AppCredentials = loadCredentials(env);
  const installationId = readInstallationId(env);

  // Authenticate the REST client as the installation via @octokit/auth-app: octokit mints and
  // refreshes the installation token internally for `pulls.*` / `checks.*` calls. The PEM is held
  // only in memory by octokit's auth strategy and never surfaced (Principle VII).
  const octokit = new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: creds.appId, privateKey: creds.privateKey, installationId },
  });

  const api = makeGitHubApi(octokit as unknown as OctokitLike);
  const workspace: Workspace = makeGitWorkspace({
    git: makeNodeGit(),
    authToken: makeAuthToken({ creds, installationId }),
  });

  // Scan the checkout to produce its project-map before the gates run (closes the always-neutral
  // defect — without this the gates never find a map and every review degrades to neutral).
  return { api, workspace, webhookSecret: creds.webhookSecret, prepareRepo };
}

/**
 * Validate the single-tenant installation id from the environment. Same fail-fast-without-leaking
 * contract as `loadCredentials` (FR-007): a missing/empty/non-integer/non-positive value throws an
 * error that NAMES the variable but never echoes the offending value.
 */
export function readInstallationId(env: Record<string, string | undefined>): number {
  const raw = env.TENANTGUARD_INSTALLATION_ID;
  const id = raw ? Number(raw) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    // Names the variable; never prints a value (FR-007).
    throw new Error("missing or invalid required environment variable: TENANTGUARD_INSTALLATION_ID");
  }
  return id;
}

/** Start the HTTP listener. Thin socket shell over the unit-tested `readBody` + `handleRequest`. */
export function start(deps: DispatchDeps = composeDeps(), port = Number(process.env.PORT) || 3000) {
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    void (async () => {
      if (req.method !== "POST") {
        res.writeHead(405).end();
        return;
      }
      try {
        const raw = await readBody(req, MAX_BODY_BYTES);
        const sig = headerValue(req.headers[GITHUB_SIGNATURE_HEADER]);
        const { status, body } = await handleRequest(raw, sig, deps);
        res.writeHead(status, { "content-type": "application/json" }).end(body);
      } catch (err) {
        if (err instanceof BodyTooLargeError) {
          res.writeHead(413, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "body_too_large" }));
          return;
        }
        // Never surface error internals (could be secret-adjacent). Generic 500.
        res.writeHead(500, { "content-type": "application/json" }).end(JSON.stringify({ ok: false, error: "internal_error" }));
      }
    })();
  });
  server.listen(port);
  return server;
}

function headerValue(h: string | string[] | undefined): string | undefined {
  return Array.isArray(h) ? h[0] : h;
}
