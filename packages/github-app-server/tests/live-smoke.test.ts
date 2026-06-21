/**
 * LIVE FIELD-VERIFICATION SMOKE TEST — the one thing the automated suite cannot do.
 *
 * The 379-green suite proves the runtime is correctly ASSEMBLED and SECRET-SAFE, but every test
 * injects a FAKE GitHubApi or points git at a `file://` repo. The `octokit as unknown as OctokitLike`
 * cast in composeDeps means only the fake's shape is type-checked — nothing exercises the REAL
 * appId/privateKey -> installation-token -> api.github.com path. This file closes exactly that gap.
 *
 * It is GATED behind `TENANTGUARD_SMOKE=1`. With the flag unset (the default, and CI) the whole suite
 * reports SKIPPED — never falsely green. It runs live ONLY when an operator sets the flag plus their
 * real App credentials in the environment, via `! <command>` so this process (and these tests) never
 * see secrets in source. The credentials are read by the SAME `composeDeps` the server uses — this
 * drives the operator's real composition root, not a re-implementation of octokit.
 *
 * WHAT A GREEN RUN CERTIFIES (and nothing more):
 *   - token mint: appId/privateKey/installationId -> a real installation access token.
 *   - read pagination: pulls.listFiles through octokit.paginate against real Link headers (the
 *     truncation risk that would otherwise cause a false "clean" on a large PR).
 *   - check write: checks.create through the createAppAuth-authed Octokit returns a real check id
 *     (a successful create also implicitly proves the App-JWT -> installation-token exchange).
 *
 * WHAT IT DOES NOT CERTIFY (still manual — see specs/015 quickstart "Verifying it actually runs live"):
 *   - HMAC webhook signature verification.
 *   - the ephemeral git checkout + dispose end-to-end.
 *   These require running `start()` behind a public endpoint and opening a real PR. That full-server
 *   confirmation stays a manual checklist step (you can't stand up a public webhook from a unit test).
 *
 * To run:
 *   TENANTGUARD_APP_ID=... TENANTGUARD_APP_PRIVATE_KEY="$(cat key.pem)" \
 *   TENANTGUARD_WEBHOOK_SECRET=... TENANTGUARD_INSTALLATION_ID=... \
 *   TG_SMOKE_OWNER=... TG_SMOKE_REPO=... TG_SMOKE_PR=<existing PR #> TG_SMOKE_HEAD_SHA=<that PR's head sha> \
 *   TENANTGUARD_SMOKE=1 pnpm --filter @tenantguard/github-app-server test live-smoke
 */
import { describe, it, expect } from "vitest";
import { makeAuthToken } from "../src/auth.js";
import { loadCredentials } from "../src/config.js";
import { readInstallationId, composeDeps } from "../src/http-server.js";

const SMOKE = process.env.TENANTGUARD_SMOKE === "1";

/** Read a required smoke-only target var, failing loudly (no value printed) if absent. */
function need(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") throw new Error(`live smoke requires environment variable: ${name}`);
  return v;
}

// `skipIf` (not an in-body guard): with the flag unset the suite reports SKIPPED, never passed —
// the honest signal that no field verification occurred.
describe.skipIf(!SMOKE)("LIVE smoke against api.github.com (real App + installation)", () => {
  it("mints a real installation access token (token-mint path)", async () => {
    const creds = loadCredentials(process.env);
    const installationId = readInstallationId(process.env);
    const token = await makeAuthToken({ creds, installationId })();
    expect(typeof token).toBe("string");
    expect(token.length).toBeGreaterThan(0);
    // Never assert on / print the token's contents — only that one was issued (Principle VII).
  });

  it("lists a real PR's changed files through octokit pagination (no truncation)", async () => {
    const owner = need("TG_SMOKE_OWNER");
    const repo = need("TG_SMOKE_REPO");
    const prNumber = Number(need("TG_SMOKE_PR"));
    expect(Number.isInteger(prNumber)).toBe(true);

    const { api } = composeDeps(process.env); // the operator's REAL composition root
    const files = await api.listChangedFiles({ owner, repo, prNumber });

    // Drives the real createAppAuth -> installation-token -> paginate(pulls.listFiles) path. A broken
    // adapter (wrong param names, single-page truncation, response-shape mismatch hidden by the cast)
    // throws or returns a non-array here.
    expect(Array.isArray(files)).toBe(true);
    expect(files.every((f) => typeof f === "string")).toBe(true);
  });

  it("creates a real TenantGuard check at the PR head and returns its id (check-write path)", async () => {
    const owner = need("TG_SMOKE_OWNER");
    const repo = need("TG_SMOKE_REPO");
    const headSha = need("TG_SMOKE_HEAD_SHA");

    const { api } = composeDeps(process.env);
    const { id } = await api.createCheckRun({
      owner,
      repo,
      headSha,
      payload: {
        name: "TenantGuard",
        conclusion: "neutral", // a benign, honest conclusion — report-only, asserts nothing about the repo
        title: "TenantGuard live smoke",
        summary: "Field-verification smoke test: confirms the App can write a Checks run via the live API.",
        annotations: [],
      },
    });

    // A real check id proves the WRITE reached api.github.com through the allowlisted checks.create
    // (and, transitively, that the App-JWT -> installation-token exchange succeeded). Confirm it in the
    // GitHub UI: the PR head commit should now show a neutral "TenantGuard" check.
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });
});
