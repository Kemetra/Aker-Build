import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { afterEach, describe, it, expect } from "vitest";
import type { Workspace } from "@aker-build/github-app";
import type { GitHubApi } from "../src/github-api.js";
import { handleRequest } from "../src/http-server.js";
import type { DispatchDeps } from "../src/server.js";

/**
 * THE regression-proof test the green suite was missing: exercise the REAL scan + REAL runGates over
 * a REAL checked-out repo (no injected runGates, no fake workspace). It proves the App can produce a
 * genuine verdict — not the "Review could not complete" always-neutral that resulted when the
 * ephemeral checkout was never scanned (gates resolved project-map.json from cwd).
 */
const SECRET = "webhook-secret";
const sign = (b: string) => `sha256=${createHmac("sha256", SECRET).update(b).digest("hex")}`;

/** Minimal shape of the posted Checks payload the assertions read. */
type ChecksPayloadShape = { conclusion: string; annotations: Array<{ path: string }> };

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
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  git("config", "core.hooksPath", ".git/aker-build-no-hooks");
  git("config", "core.excludesFile", ".git/aker-build-no-global-ignore");
  mkdirSync(join(dir, "apps", "api"), { recursive: true });
  writeFileSync(join(dir, "apps", "api", "index.ts"), "export const x = 1;\n");
  writeFileSync(join(dir, "README.md"), "# real repo\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "init");
  return dir;
}

/**
 * A repo whose changed file is an admin route with NO role guard anywhere in the file. G4-Security
 * emits a high-confidence (confirmed) finding for this → verdict not_ready → Checks `failure`. This
 * is the simplest deterministic high-confidence trigger that needs no queue item / declared map.
 */
function makeRepoWithUnguardedAdminRoute(): string {
  const dir = mkdtempSync(join(tmpdir(), "tg-realrepo-bad-"));
  dirs.push(dir);
  const git = (...a: string[]) => execFileSync("git", a, { cwd: dir, stdio: "pipe" });
  git("init", "--quiet");
  git("config", "user.email", "t@t.test");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  git("config", "core.hooksPath", ".git/aker-build-no-hooks");
  git("config", "core.excludesFile", ".git/aker-build-no-global-ignore");
  mkdirSync(join(dir, "apps", "api", "routes"), { recursive: true });
  // Admin route, no requireRole/isAdmin/hasRole/checkRole/authorize token anywhere → confidence:high.
  writeFileSync(join(dir, "apps", "api", "routes", "admin.ts"), "app.get('/admin', (req, res) => res.send('hi'));\n");
  writeFileSync(join(dir, "README.md"), "# repo with unguarded admin route\n");
  git("add", "-A");
  git("commit", "--quiet", "-m", "init");
  return dir;
}

interface ComparisonFixture {
  baseRepo: string;
  headRepo: string;
  baseSha: string;
  headSha: string;
}

function makeComparisonFixture(kind: "clean" | "admin"): ComparisonFixture {
  const origin = mkdtempSync(join(tmpdir(), `tg-realrepo-${kind}-origin-`));
  dirs.push(origin);
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git(origin, "init", "--quiet");
  git(origin, "config", "user.email", "t@t.test");
  git(origin, "config", "user.name", "t");
  git(origin, "config", "commit.gpgsign", "false");
  git(origin, "config", "core.autocrlf", "false");
  mkdirSync(join(origin, "apps", "api", "routes"), { recursive: true });
  writeFileSync(join(origin, "package.json"), '{"name":"fixture"}\n');
  writeFileSync(join(origin, "apps", "api", "index.ts"), "export const x = 1;\n");
  writeFileSync(join(origin, "apps", "api", "routes", "health.ts"), "export const ok = 1;\n");
  git(origin, "add", "-A");
  git(origin, "commit", "--quiet", "-m", "base");
  const baseSha = git(origin, "rev-parse", "HEAD");
  if (kind === "admin") {
    writeFileSync(
      join(origin, "apps", "api", "routes", "admin.ts"),
      "app.get('/admin', (req, res) => res.send('hi'));\n",
    );
  } else {
    writeFileSync(join(origin, "apps", "api", "index.ts"), "export const x = 2;\n");
  }
  git(origin, "add", "-A");
  git(origin, "commit", "--quiet", "-m", "head");
  const headSha = git(origin, "rev-parse", "HEAD");
  const baseRepo = mkdtempSync(join(tmpdir(), "tg-realrepo-base-"));
  const headRepo = mkdtempSync(join(tmpdir(), "tg-realrepo-head-"));
  dirs.push(baseRepo, headRepo);
  execFileSync("git", ["clone", "--quiet", origin, baseRepo], { stdio: "ignore" });
  execFileSync("git", ["checkout", "--quiet", baseSha], { cwd: baseRepo, stdio: "ignore" });
  execFileSync("git", ["clone", "--quiet", origin, headRepo], { stdio: "ignore" });
  execFileSync("git", ["checkout", "--quiet", headSha], { cwd: headRepo, stdio: "ignore" });
  return { baseRepo, headRepo, baseSha, headSha };
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

function comparisonWorkspace(fixture: ComparisonFixture): Workspace {
  return {
    async checkout({ headSha }) {
      if (headSha === fixture.baseSha) return fixture.baseRepo;
      if (headSha === fixture.headSha) return fixture.headRepo;
      throw new Error("unexpected checkout SHA");
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

function body(fixture: ComparisonFixture): string {
  return JSON.stringify({
    action: "opened",
    pull_request: {
      number: 7,
      draft: false,
      base: { sha: fixture.baseSha },
      head: { sha: fixture.headSha },
    },
    repository: { owner: { login: "org" }, name: "repo" },
    installation: { id: 1 },
  });
}

describe("REAL scan + REAL gates over a REAL checkout (regression guard for always-neutral)", () => {
  it("produces a genuine verdict, NOT the 'could not complete' neutral fallback", async () => {
    const fixture = makeComparisonFixture("clean");
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
      workspace: comparisonWorkspace(fixture),
      webhookSecret: SECRET,
    };

    const rawBody = body(fixture);
    const res = await handleRequest(rawBody, sign(rawBody), deps);

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

  it("a CONFIRMED finding in a changed file → conclusion `failure` with an annotation at that file (verdict correctness)", async () => {
    // G4: unguarded admin route → high-confidence → confirmed → not_ready → failure. The changed-set
    // MUST include the file (attribution: a finding only blocks if its path is in the changed set).
    const ADMIN = "apps/api/routes/admin.ts";
    const fixture = makeComparisonFixture("admin");
    let posted: ChecksPayloadShape | undefined;
    const recordingApi: GitHubApi = {
      ...api([ADMIN]),
      async createCheckRun(args) {
        posted = args.payload as unknown as ChecksPayloadShape;
        return { id: 1 };
      },
    };
    const deps: DispatchDeps = {
      api: recordingApi,
      workspace: comparisonWorkspace(fixture),
      webhookSecret: SECRET,
    };

    const rawBody = body(fixture);
    const res = await handleRequest(rawBody, sign(rawBody), deps);

    expect(res.status).toBe(200);
    expect(posted?.conclusion).toBe("failure"); // a real confirmed finding blocks — not neutral
    // The annotation points at the offending changed file (proves attribution wired correctly).
    expect(posted?.annotations.some((a) => a.path === ADMIN)).toBe(true);
  });

  it("a CLEAN changed file (no risky pattern) → conclusion `success`", async () => {
    // makeRealRepo plants only a trivial `export const x = 1`; nothing triggers a confirmed finding.
    const CLEAN = "apps/api/index.ts";
    const fixture = makeComparisonFixture("clean");
    let posted: ChecksPayloadShape | undefined;
    const recordingApi: GitHubApi = {
      ...api([CLEAN]),
      async createCheckRun(args) {
        posted = args.payload as unknown as ChecksPayloadShape;
        return { id: 1 };
      },
    };
    const deps: DispatchDeps = {
      api: recordingApi,
      workspace: comparisonWorkspace(fixture),
      webhookSecret: SECRET,
    };

    const rawBody = body(fixture);
    const res = await handleRequest(rawBody, sign(rawBody), deps);

    expect(res.status).toBe(200);
    expect(posted?.conclusion).toBe("success");
  });

  it("a scan failure concludes neutral WITHOUT leaking the absolute checkout path into the summary", async () => {
    const fixture = makeComparisonFixture("clean");
    let posted = "";
    const recordingApi: GitHubApi = {
      ...api(["apps/api/index.ts"]),
      async createCheckRun(args) {
        posted = JSON.stringify(args.payload);
        return { id: 1 };
      },
    };
    const leakyWorkspace: Workspace = {
      async checkout() {
        throw new Error(`checkout failed at ${fixture.baseRepo}/private-token`);
      },
      async dispose() {},
    };
    const deps: DispatchDeps = {
      api: recordingApi,
      workspace: leakyWorkspace,
      webhookSecret: SECRET,
    };

    const rawBody = body(fixture);
    const res = await handleRequest(rawBody, sign(rawBody), deps);

    expect(res.status).toBe(200);
    const parsed = JSON.parse(posted) as { conclusion: string };
    expect(parsed.conclusion).toBe("neutral"); // incomplete → neutral, never false success
    expect(posted).not.toContain(fixture.baseRepo); // the absolute checkout path must NOT appear in the summary
    expect(posted).not.toContain(".aker-build/project-map.json");
  });
});
