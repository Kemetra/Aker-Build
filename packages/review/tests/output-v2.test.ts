import { describe, expect, it } from "vitest";
import { renderChecksPayload } from "../src/checks.js";
import { renderReport } from "../src/render.js";
import type { ComparedGateFinding, ReviewReportV2 } from "../src/types.js";

function finding(
  classification: ComparedGateFinding["classification"],
  line: number,
  overrides: Partial<ComparedGateFinding> = {},
): ComparedGateFinding {
  return {
    gate_id: "TG-G4",
    status: "risk",
    severity: "high",
    evidence: [{ type: "line", path: "src/access.ts", line, signal: `${classification} risk`, confidence: "high" }],
    classification,
    fingerprint: String(line).padStart(64, "a").slice(-64),
    source: classification === "resolved" ? "base" : "head",
    line_changed: classification === "new" || classification === "changed",
    ...overrides,
  } as ComparedGateFinding;
}

function report(findings: ComparedGateFinding[]): ReviewReportV2 {
  const counts = { new: 0, existing: 0, resolved: 0, changed: 0, unattributed: 0 };
  for (const item of findings) counts[item.classification] += 1;
  return {
    schema_version: 2,
    mode: "pr",
    verdict: "not_ready",
    changed_files: ["src/access.ts"],
    changed_ranges: [{ path: "src/access.ts", ranges: [{ start: 7, end: 7 }], binary: false }],
    findings,
    scope: { checked: false, violations: [] },
    github_available: true,
    comparison: {
      base: { label: "base", sha: "1".repeat(40) },
      head: { label: "head", sha: "2".repeat(40) },
      complete: true,
      incomplete_reasons: [],
      counts,
    },
  };
}

describe("v2 review output migration", () => {
  it("renders introduced, existing debt, resolved, and unattributed sections with refs", () => {
    const markdown = renderReport(report([
      finding("new", 7),
      finding("existing", 2, { line_changed: false }),
      finding("resolved", 3, { line_changed: false }),
      finding("unattributed", 4, { line_changed: false }),
    ]));

    expect(markdown).toContain("## Introduced or worsened");
    expect(markdown).toContain("## Existing debt");
    expect(markdown).toContain("## Resolved or improved");
    expect(markdown).toContain("## Needs attribution");
    expect(markdown).toContain("base");
    expect(markdown).toContain("head");
  });

  it("annotates only unsuppressed introduced/worsened findings on actual changed head lines", () => {
    const payload = renderChecksPayload(report([
      finding("new", 7),
      finding("existing", 2, { line_changed: false }),
      finding("resolved", 3, { line_changed: false }),
      finding("unattributed", 4, { line_changed: false }),
      finding("changed", 7, { change: "improved" }),
      finding("changed", 7, { change: "worsened", fingerprint: "b".repeat(64) }),
      finding("new", 7, {
        fingerprint: "c".repeat(64),
        suppression: { id: "accepted", reason: "owned", owner: "security", matched_by: "path" },
      }),
      finding("new", 9, { fingerprint: "d".repeat(64), line_changed: false }),
    ]));

    expect(payload.annotations).toHaveLength(2);
    expect(payload.annotations.every((annotation) => annotation.start_line === 7)).toBe(true);
  });

  it("keeps incomplete reasons in the summary without manufacturing annotations", () => {
    const value = report([]);
    value.verdict = "needs_verification";
    value.comparison.complete = false;
    value.comparison.incomplete_reasons = ["diff_unavailable"];
    const payload = renderChecksPayload(value);

    expect(payload.conclusion).toBe("neutral");
    expect(payload.summary).toContain("diff_unavailable");
    expect(payload.annotations).toEqual([]);
  });
});
