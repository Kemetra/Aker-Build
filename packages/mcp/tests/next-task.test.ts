import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { nextTask } from "../src/tools.js";

function gitRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-mcp-nt-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  const git = (...args: string[]): void => {
    execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  };
  git("init", "--quiet");
  git("config", "user.email", "t@example.test");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "--quiet", "-m", "baseline");
  return root;
}

/** A repo with an unguarded admin route — produces at least one routable finding. */
function riskyRepo(): string {
  return gitRepo({
    "package.json": `{"name":"t","dependencies":{"express":"^4"}}`,
    "src/a.ts": `app.get("/admin/x", (q, r) => r.json({}));\n`,
  });
}

describe("nextTask", () => {
  it("answers a cold call without the caller running the CLI first", () => {
    const root = riskyRepo();
    const res = nextTask(root, { out: join(root, ".out") });
    expect(res.item).not.toBeNull();
    expect(res.item?.id).toBeTruthy();
    expect(res.freshness.refreshed).toBe(true);
  });

  it("returns the scope the agent may and may not touch", () => {
    const root = riskyRepo();
    const res = nextTask(root, { out: join(root, ".out") });
    expect(Array.isArray(res.allowed_files)).toBe(true);
    expect(Array.isArray(res.forbidden_files)).toBe(true);
  });

  it("carries the evidence that justified the task", () => {
    const root = riskyRepo();
    const res = nextTask(root, { out: join(root, ".out") });
    expect(Array.isArray(res.evidence)).toBe(true);
    for (const e of res.evidence) {
      expect(typeof e.path).toBe("string");
      expect(typeof e.signal).toBe("string");
    }
  });

  it("explains itself when there is no safe task rather than returning a bare null", () => {
    const root = gitRepo({
      "package.json": `{"name":"clean"}`,
      "README.md": `# clean\n`,
    });
    const res = nextTask(root, { out: join(root, ".out") });
    if (res.item === null) {
      expect(res.reason).toBeTruthy();
    }
  });

  it("reports staleness rather than hiding it", () => {
    const root = riskyRepo();
    const out = join(root, ".out");
    nextTask(root, { out });
    const second = nextTask(root, { out, ttlMs: 60_000 });
    expect(second.freshness.refreshed).toBe(false);
    expect(second.freshness.age_ms).toBeGreaterThanOrEqual(0);
  });
});
