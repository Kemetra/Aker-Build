import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Finding } from "@aker-build/gates";
import { compareReview } from "../src/compare-review.js";
import type { ComparedGateFinding, ScopeResult } from "../src/types.js";

const roots: string[] = [];
const noScope: ScopeResult = { checked: false, violations: [] };

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function trees(baseText: string, headText: string): { root: string; base: string; head: string } {
  const root = mkdtempSync(join(tmpdir(), "aker-compare-review-"));
  roots.push(root);
  const base = join(root, "base");
  const head = join(root, "head");
  mkdirSync(base);
  mkdirSync(head);
  writeFileSync(join(base, "access.ts"), baseText, "utf8");
  writeFileSync(join(head, "access.ts"), headText, "utf8");
  return { root, base, head };
}

function risk(line: number, confidence: "high" | "medium" = "high"): Finding {
  return {
    gate_id: "TG-G4",
    status: "risk",
    severity: "high",
    evidence: [{ type: "line", path: "access.ts", line, signal: "unguarded access", confidence }],
  };
}

function input(baseRoot: string, headRoot: string, scope: ScopeResult = noScope) {
  return {
    mode: "local-diff" as const,
    baseRoot,
    headRoot,
    base: { label: "HEAD", sha: "1".repeat(40) },
    head: { label: "working-tree", sha: null },
    scope,
    githubAvailable: null,
  };
}

describe("shared base/head review engine", () => {
  it("keeps old debt existing while a newly introduced confirmed risk blocks", () => {
    const { base, head } = trees(
      ["old risk", "same", "same", "same", "same", "safe", "tail"].join("\n"),
      ["old risk", "same", "same", "same", "same", "new risk", "tail"].join("\n"),
    );
    const report = compareReview(input(base, head), {
      analyze: (root) => root === base ? [risk(1)] : [risk(1), risk(6)],
    });

    expect(report.schema_version).toBe(2);
    expect(report.verdict).toBe("not_ready");
    expect(report.findings
      .filter((finding): finding is ComparedGateFinding => !("kind" in finding))
      .map((finding) => finding.classification)
      .sort())
      .toEqual(["existing", "new"]);
    expect(report.comparison).toMatchObject({
      complete: true,
      counts: { new: 1, existing: 1, resolved: 0, changed: 0, unattributed: 0 },
    });
    expect(report.changed_ranges).toEqual([
      { path: "access.ts", ranges: [{ start: 6, end: 6 }], binary: false },
    ]);
  });

  it("surfaces resolved findings positively without blocking", () => {
    const { base, head } = trees("old risk\n", "safe\n");
    const report = compareReview(input(base, head), {
      analyze: (root) => root === base ? [risk(1)] : [],
    });

    expect(report.verdict).toBe("ready");
    expect(report.comparison.counts.resolved).toBe(1);
    expect(report.findings[0]).toMatchObject({ classification: "resolved", source: "base" });
  });

  it("cannot return ready when the diff is incomplete", () => {
    const { base, head } = trees("same\n", "same\n");
    const report = compareReview(input(base, head), {
      analyze: () => [],
      diff: () => ({ changedFiles: [], complete: false, incompleteReasons: ["diff_unavailable"] }),
    });

    expect(report.verdict).toBe("needs_verification");
    expect(report.comparison.complete).toBe(false);
    expect(report.comparison.incomplete_reasons).toEqual(["diff_unavailable"]);
  });
});
