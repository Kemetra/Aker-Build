import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { scanToFile } from "@aker-build/scanner";
import { reviewLocalDiff } from "../src/review.js";
import { reviewPr } from "../src/pr.js";

function fixture(): { root: string; out: string; baseSha: string; headSha: string } {
  const root = join(mkdtempSync(join(tmpdir(), "aker-review-pr-v2-")), "repo");
  mkdirSync(join(root, "apps", "api", "routes"), { recursive: true });
  const git = (...args: string[]) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  git("init", "-q");
  git("config", "user.email", "test@aker-build.local");
  git("config", "user.name", "Aker Build Test");
  git("config", "commit.gpgsign", "false");
  git("config", "core.autocrlf", "false");
  git("config", "core.hooksPath", ".git/aker-build-no-hooks");
  git("config", "core.excludesFile", ".git/aker-build-no-global-ignore");
  writeFileSync(join(root, "package.json"), '{"name":"fixture"}\n', "utf8");
  writeFileSync(join(root, "apps", "api", "routes", "health.ts"), "export const ok = 1;\n", "utf8");
  git("add", ".");
  git("commit", "-q", "-m", "base");
  const baseSha = git("rev-parse", "HEAD");
  writeFileSync(
    join(root, "apps", "api", "routes", "admin.ts"),
    "app.get('/admin', (req, res) => res.send('hi'));\n",
    "utf8",
  );
  git("add", ".");
  git("commit", "-q", "-m", "head");
  const headSha = git("rev-parse", "HEAD");
  const out = join(root, ".aker-build");
  scanToFile(root, out);
  return { root, out, baseSha, headSha };
}

function metadata(baseSha: string, headSha: string) {
  return {
    title: "Add admin route",
    state: "OPEN",
    baseRefName: "main",
    baseRefOid: baseSha,
    headRefOid: headSha,
  };
}

describe("v2 CLI PR adapter", () => {
  it("compares the exact API OIDs and matches local classification for identical refs", () => {
    const { root, out, baseSha, headSha } = fixture();
    const pr = reviewPr(42, { out }, {
      repoRoot: root,
      prMetadata: () => metadata(baseSha, headSha),
    });
    const local = reviewLocalDiff({ out, base: baseSha }, { repoRoot: root });

    expect(pr.schema_version).toBe(2);
    if (pr.schema_version !== 2 || local.schema_version !== 2) throw new Error("expected v2 reports");
    expect(pr.comparison.base.sha).toBe(baseSha);
    expect(pr.comparison.head.sha).toBe(headSha);
    expect(pr.verdict).toBe("not_ready");
    expect(pr.findings).toEqual(local.findings);
    expect(pr.changed_ranges).toEqual(local.changed_ranges);
  });

  it("returns needs verification when an API OID is not present locally", () => {
    const { root, out, headSha } = fixture();
    const report = reviewPr(42, { out }, {
      repoRoot: root,
      prMetadata: () => metadata("f".repeat(40), headSha),
    });

    expect(report.schema_version).toBe(2);
    if (report.schema_version !== 2) throw new Error("expected v2 report");
    expect(report.verdict).toBe("needs_verification");
    expect(report.comparison.complete).toBe(false);
    expect(report.comparison.incomplete_reasons).toEqual(["base_unavailable"]);
  });
});
