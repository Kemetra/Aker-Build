import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { afterEach, describe, it, expect } from "vitest";
import type { Workspace } from "@tenantguard/github-app";
import type { GitHubApi } from "../src/github-api.js";
import { handleRequest } from "../src/http-server.js";
import { prepareRepo } from "../src/prepare-repo.js";
import type { DispatchDeps } from "../src/server.js";

/**
 * THE regression-proof test the green suite was missing: exercise the REAL scan + REAL runGates over
 * a REAL checked-out repo (no injected runGates, no fake workspace). It proves the App can produce a
 * genuine verdict — not the "Review could not complete" always-neutral that resulted when the
 * ephemeral checkout was never scanned (gates resolved project-map.json from cwd).
 */
const SECRET = "webhook-secret";
const sign = (b: string) => `sha256=${createHmac("sha256", SECRET).update(b).digest("hex")}`;

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

/** Make a real, committed git repo with a couple of source files for the gates to inspect. */
function makeRealRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "tg-realrepo-"));
  dirs.push(dir);
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "--quiet");
  git("config", "user.email", "t@t.test");
  git("config", "user.name", "t");
  mkdirSync(join(dir, "apps", "api"), { recursive: true });
  writeFileSync(join(dir, "apps", "api", "index.ts"), "export const x = 1;\n");
  writeFileSync(join(dir, "README.md"), "# real repo\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "init");
  return dir;
}

/** A workspace that hands the runner the REAL repo dir (no network); dispose is a no-op (test owns it). */
function realWorkspace(repoDir: string): Workspace {
  return {
    async checkout() {
      return repoDir;
    },
    async dispose() {},
  };
}

function api(changed: string[]): GitHubApi {
  return {
    async listChangedFiles() {
      return changed;
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

const body = JSON.stringify({
  action: "opened",
  pull_request: { number: 7, draft: false, head: { sha: "0000000000000000000000000000000000000000" } },
  repository: { owner: { login: "org" }, name: "repo" },
  installation: { id: 1 },
});

describe("REAL scan + REAL gates over a REAL checkout (regression guard for always-neutral)", () => {
  it("produces a genuine verdict, NOT the 'could not complete' neutral fallback", async () => {
    const repo = makeRealRepo();
    let posted = "";
    const recordingApi: GitHubApi = {
      ...api(["apps/api/index.ts"]),
      async createCheckRun(args) {
        posted = JSON.stringify(args.payload);
        return { id: 1 };
      },
    };
    const deps: DispatchDeps = {
      api: recordingApi,
      workspace: realWorkspace(repo),
      webhookSecret: SECRET,
      prepareRepo, // the REAL scan — this is what was missing
    };

    const res = await handleRequest(body, sign(body), deps);

    expect(res.status).toBe(200);
    // The DEFECT signature: title "Review could not complete" + the MissingProjectMapError-driven
    // neutral. A correctly-wired App scans the checkout first, so the gates run for real and the
    // payload is a genuine verdict — it must NOT be the could-not-complete fallback.
    expect(posted).not.toContain("Review could not complete");
    expect(posted).not.toContain("could not complete this review");
    // A real render occurred → a valid conclusion (proves it wasn't an error-fallback).
    const parsed = JSON.parse(posted) as { conclusion: string };
    expect(["success", "neutral", "failure"]).toContain(parsed.conclusion);
  });

  it("a scan failure concludes neutral WITHOUT leaking the absolute checkout path into the summary", async () => {
    const repo = makeRealRepo();
    let posted = "";
    const recordingApi: GitHubApi = {
      ...api(["apps/api/index.ts"]),
      async createCheckRun(args) {
        posted = JSON.stringify(args.payload);
        return { id: 1 };
      },
    };
    // A prepareRepo that fails with the absolute checkout path in its message (as scanToFile would).
    const leakyPrepare = (repoRoot: string): string => {
      throw new Error(`scan failed at ${repoRoot}/.tenantguard/project-map.json`);
    };
    const deps: DispatchDeps = {
      api: recordingApi,
      workspace: realWorkspace(repo),
      webhookSecret: SECRET,
      prepareRepo: leakyPrepare,
    };

    const res = await handleRequest(body, sign(body), deps);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(posted) as { conclusion: string };
    expect(parsed.conclusion).toBe("neutral"); // incomplete → neutral, never false success
    expect(posted).not.toContain(repo); // the absolute checkout path must NOT appear in the summary
    expect(posted).not.toContain(".tenantguard/project-map.json");
  });
});
