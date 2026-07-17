import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { REVIEW_SCHEMA_VERSION, validateReview } from "../src/schema.js";

const v1 = JSON.parse(
  readFileSync(fileURLToPath(new URL("./fixtures/review-v1.json", import.meta.url)), "utf8"),
) as unknown;

const v2 = {
  schema_version: 2,
  mode: "local-diff",
  verdict: "not_ready",
  changed_files: ["src/admin.ts"],
  changed_ranges: [{ path: "src/admin.ts", ranges: [{ start: 7, end: 7 }], binary: false }],
  findings: [
    {
      gate_id: "TG-G4",
      status: "risk",
      severity: "high",
      evidence: [{ type: "line", path: "src/admin.ts", line: 7, signal: "unguarded admin route", confidence: "high" }],
      classification: "new",
      fingerprint: "a".repeat(64),
      source: "head",
      line_changed: true,
    },
  ],
  scope: { checked: false, violations: [] },
  github_available: null,
  comparison: {
    base: { label: "HEAD", sha: "1".repeat(40) },
    head: { label: "working-tree", sha: null },
    complete: true,
    incomplete_reasons: [],
    counts: { new: 1, existing: 0, resolved: 0, changed: 0, unattributed: 0 },
  },
};

describe("review schema v2 migration", () => {
  it("keeps the frozen v1 artifact valid", () => {
    expect(validateReview(v1)).toEqual({ ok: true, errors: [] });
  });

  it("uses v2 as the producer version and validates the complete v2 contract", () => {
    expect(REVIEW_SCHEMA_VERSION).toBe(2);
    expect(validateReview(v2)).toEqual({ ok: true, errors: [] });
  });

  it("rejects a version-2 document that omits comparison metadata", () => {
    const { comparison: _comparison, ...invalid } = v2;
    const result = validateReview(invalid);
    expect(result.ok).toBe(false);
    expect(result.errors.some((error) => error.path.includes("comparison"))).toBe(true);
  });

  it("rejects arbitrary classifications, fingerprints, and incomplete reasons", () => {
    const invalid = {
      ...v2,
      findings: [{ ...v2.findings[0]!, classification: "probably_old", fingerprint: "source text" }],
      comparison: { ...v2.comparison, incomplete_reasons: ["C:/private/error"] },
    };
    expect(validateReview(invalid).ok).toBe(false);
  });
});
