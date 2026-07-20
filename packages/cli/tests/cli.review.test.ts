import { describe, it, expect, afterEach } from "vitest";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { scanToFile } from "@aker-build/scanner";
import { GitHubUnavailableError } from "@aker-build/review";
import { runReviewCommand } from "../src/commands/review.js";

/** A temp git repo with a committed baseline + an uncommitted change, and a real project-map.json. */
function reviewRepo(opts: { withMap?: boolean; git?: boolean } = {}): { root: string; outDir: string } {
  const root = join(mkdtempSync(join(tmpdir(), "aker-build-cli-review-")), "repo");
  mkdirSync(root, { recursive: true });
  if (opts.git !== false) {
    execFileSync("git", ["init", "-q"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "t@t.local"], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["config", "user.name", "T"], { cwd: root, stdio: "ignore" });
  }
  writeFileSync(join(root, "index.ts"), "export const x = 1;\n", "utf8");
  if (opts.git !== false) {
    execFileSync("git", ["add", "."], { cwd: root, stdio: "ignore" });
    execFileSync("git", ["-c", "commit.gpgsign=false", "commit", "-q", "-m", "base"], { cwd: root, stdio: "ignore" });
    writeFileSync(join(root, "index.ts"), "export const x = 2;\n", "utf8"); // uncommitted change
  }
  const outDir = join(root, ".aker-build");
  mkdirSync(outDir, { recursive: true });
  // scanToFile(targetPath, outDir) requires a Git repo; only produce a map when git is enabled.
  if (opts.withMap !== false && opts.git !== false) scanToFile(root, outDir);
  return { root, outDir };
}

const created: string[] = [];
afterEach(() => {
  for (const p of created) if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  created.length = 0;
});

describe("T017 `aker-build review-pr --local-diff`", () => {
  it("reviews the local diff, writes review.json + review.md, exits 0", () => {
    const { root, outDir } = reviewRepo();
    created.push(resolve(root, ".."));
    const out: string[] = [];
    const code = runReviewCommand(root, { localDiff: true, out: outDir, sink: (s) => out.push(s), errSink: () => {} });
    expect(code).toBe(0);
    expect(existsSync(join(outDir, "review.json"))).toBe(true);
    expect(existsSync(join(outDir, "review.md"))).toBe(true);
    const review = JSON.parse(readFileSync(join(outDir, "review.json"), "utf8"));
    expect(["ready", "not_ready", "needs_verification"]).toContain(review.verdict);
  });

  it("exits 1 with 'run scan first' when project-map.json is missing", () => {
    const { root, outDir } = reviewRepo({ withMap: false });
    created.push(resolve(root, ".."));
    const err: string[] = [];
    const code = runReviewCommand(root, { localDiff: true, out: outDir, errSink: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/scan/i);
  });

  it("exits 2 when neither --local-diff nor a PR number is given", () => {
    const { root, outDir } = reviewRepo();
    created.push(resolve(root, ".."));
    const code = runReviewCommand(undefined, { out: outDir, errSink: () => {} });
    expect(code).toBe(2);
  });

  it("exits 2 on a non-Git directory", () => {
    const { root, outDir } = reviewRepo({ git: false });
    created.push(resolve(root, ".."));
    const code = runReviewCommand(root, { localDiff: true, out: outDir, errSink: () => {} });
    expect(code).toBe(2);
  });

  it("exits 1 with 'run queue first' when --item is given but queue.json is missing", () => {
    const { root, outDir } = reviewRepo(); // has project-map.json, no queue.json
    created.push(resolve(root, ".."));
    const err: string[] = [];
    const code = runReviewCommand(root, { localDiff: true, item: "Q-001", out: outDir, errSink: (s) => err.push(s) });
    expect(code).toBe(1);
    expect(err.join("\n")).toMatch(/queue/i);
  });

  it("exits 2 on an unknown --item id", () => {
    const { root, outDir } = reviewRepo();
    created.push(resolve(root, ".."));
    // write a queue.json that does NOT contain the requested id
    writeFileSync(join(outDir, "queue.json"), JSON.stringify({ schema_version: 1, items: [] }), "utf8");
    const code = runReviewCommand(root, { localDiff: true, item: "Q-999", out: outDir, errSink: () => {} });
    expect(code).toBe(2);
  });

  it("with --item and an in-scope diff, scope is checked and reported", () => {
    const { root, outDir } = reviewRepo();
    created.push(resolve(root, ".."));
    const item = {
      id: "Q-001", title: "t", status: "ready", type: "implementation",
      source: { evidence: [] }, priority: "medium", risk: "medium", depends_on: [],
      lock_scope: { files: [] }, allowed_files: ["index.ts"], forbidden_files: [],
      gates: [], validation: ["pnpm -r test"], stop_conditions: [], final_report: { required: [] },
    };
    writeFileSync(join(outDir, "queue.json"), JSON.stringify({ schema_version: 1, items: [item] }), "utf8");
    const code = runReviewCommand(root, { localDiff: true, item: "Q-001", out: outDir, errSink: () => {} });
    expect(code).toBe(0);
    const review = JSON.parse(readFileSync(join(outDir, "review.json"), "utf8"));
    expect(review.scope.checked).toBe(true);
    expect(review.scope.item_id).toBe("Q-001");
    // the only changed source file (index.ts) IS in allowed_files → no scope violation, and the
    // out-dir artifacts must NOT appear as out-of-scope changes (SC-007 self-reference fix).
    expect(review.scope.violations).toEqual([]);
    expect(review.changed_files).not.toContain(".aker-build/queue.json");
    expect(review.changed_files).not.toContain(".aker-build/review.json");
    expect(review.verdict).toBe("ready");
  });

  it("PR mode: exits 2 with a clear gap when GitHub access is unavailable (local-diff still works)", () => {
    const { root, outDir } = reviewRepo();
    created.push(resolve(root, ".."));
    const err: string[] = [];
    // Force the gh source to be unavailable via an injected dep on the command.
    const code = runReviewCommand("42", {
      out: outDir,
      errSink: (s) => err.push(s),
      prDeps: {
        prChangedFiles: () => {
          throw new GitHubUnavailableError("GitHub access unavailable: `gh` CLI not found");
        },
      },
    });
    expect(code).toBe(2);
    expect(err.join("\n")).toMatch(/github|gh/i);
  });
});
