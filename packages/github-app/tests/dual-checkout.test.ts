import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { run, type Workspace } from "../src/review-runner.js";
import type { PullRequestEvent } from "../src/types.js";

function fixture() {
  const parent = mkdtempSync(join(tmpdir(), "aker-app-dual-"));
  const origin = join(parent, "origin");
  mkdirSync(join(origin, "apps", "api", "routes"), { recursive: true });
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  git(origin, "init", "-q");
  git(origin, "config", "user.email", "test@aker-build.local");
  git(origin, "config", "user.name", "Aker Build Test");
  git(origin, "config", "commit.gpgsign", "false");
  git(origin, "config", "core.autocrlf", "false");
  writeFileSync(join(origin, "package.json"), '{"name":"fixture"}\n', "utf8");
  writeFileSync(join(origin, "apps", "api", "routes", "health.ts"), "export const ok = 1;\n", "utf8");
  git(origin, "add", ".");
  git(origin, "commit", "-q", "-m", "base");
  const baseSha = git(origin, "rev-parse", "HEAD");
  writeFileSync(
    join(origin, "apps", "api", "routes", "admin.ts"),
    "app.get('/admin', (req, res) => res.send('hi'));\n",
    "utf8",
  );
  git(origin, "add", ".");
  git(origin, "commit", "-q", "-m", "head");
  const headSha = git(origin, "rev-parse", "HEAD");

  const baseRoot = join(parent, "base-checkout");
  const headRoot = join(parent, "head-checkout");
  execFileSync("git", ["clone", "-q", origin, baseRoot], { stdio: "ignore" });
  execFileSync("git", ["checkout", "-q", baseSha], { cwd: baseRoot, stdio: "ignore" });
  execFileSync("git", ["clone", "-q", origin, headRoot], { stdio: "ignore" });
  execFileSync("git", ["checkout", "-q", headSha], { cwd: headRoot, stdio: "ignore" });
  return { baseSha, headSha, baseRoot, headRoot };
}

describe("App v2 dual-checkout adapter", () => {
  it("checks out, compares, and disposes distinct webhook base/head SHAs", async () => {
    const { baseSha, headSha, baseRoot, headRoot } = fixture();
    const checkedOut: string[] = [];
    const disposed: string[] = [];
    const workspace: Workspace = {
      async checkout({ headSha: requested }) {
        checkedOut.push(requested);
        if (requested === baseSha) return baseRoot;
        if (requested === headSha) return headRoot;
        throw new Error("unexpected SHA");
      },
      async dispose(root) {
        disposed.push(root);
      },
    };
    const event: PullRequestEvent = {
      owner: "org",
      repo: "repo",
      prNumber: 42,
      baseSha,
      headSha,
      isDraft: false,
      installationId: 99,
    };

    const report = await run(event, {
      workspace,
      prMetadata: () => ({ title: "Add admin route", state: "open", baseRefName: "main" }),
    });

    expect(report.schema_version).toBe(2);
    if (report.schema_version !== 2) throw new Error("expected v2 report");
    expect(checkedOut).toEqual([baseSha, headSha]);
    expect(disposed).toEqual([headRoot, baseRoot]);
    expect(report.comparison.base.sha).toBe(baseSha);
    expect(report.comparison.head.sha).toBe(headSha);
    expect(report.verdict).toBe("not_ready");
    expect(report.comparison.counts.new).toBeGreaterThan(0);
  });
});
