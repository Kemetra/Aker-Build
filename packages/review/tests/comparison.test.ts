import { describe, expect, it } from "vitest";
import { findingId, type Finding } from "@aker-build/gates";
import { classifyFindings, findingFingerprint } from "../src/comparison.js";

const baseRoot = "base";
const headRoot = "head";
type ComparisonInput = Parameters<typeof classifyFindings>[0];

function risk(
  line: number,
  overrides: Partial<Extract<Finding, { status: "risk" }>> = {},
): Extract<Finding, { status: "risk" }> {
  return {
    gate_id: "TG-G4",
    status: "risk",
    severity: "high",
    evidence: [{
      type: "line",
      path: "src/access.ts",
      line,
      signal: "unguarded tenant access",
      confidence: "high",
    }],
    ...overrides,
  };
}

function sourceReader(sources: Record<string, string>) {
  return (root: string, path: string): string | null => sources[`${root}:${path}`] ?? null;
}

function compare(input: Omit<ComparisonInput, "baseRoot" | "headRoot">): ReturnType<typeof classifyFindings> {
  return classifyFindings({ ...input, baseRoot, headRoot });
}

/** Classify a single side-only finding (base xor head) against static source, unchanged lines. */
function classifyLoneFinding(side: "base" | "head", finding: Finding): ReturnType<typeof classifyFindings>[number] {
  const [classified] = compare({
    base: side === "base" ? [finding] : [],
    head: side === "head" ? [finding] : [],
    readSource: sourceReader({ [`${side}:src/access.ts`]: block.join("\n") }),
    lineChanged: () => false,
  });
  return classified!;
}

const block = ["before one", "before two", "dangerous call", "after one", "after two"];

describe("diff-aware finding comparison", () => {
  it("pairs the same finding as existing when an unchanged context moves lines", () => {
    const readSource = sourceReader({
      "base:src/access.ts": block.join("\n"),
      "head:src/access.ts": ["padding", "padding", "padding", "padding", "padding", "padding", ...block].join("\n"),
    });

    const result = compare({
      base: [risk(3)],
      head: [risk(9)],
      readSource,
      lineChanged: () => false,
    });

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ classification: "existing", source: "head", line_changed: false });
  });

  it("ignores unrelated source edits outside the bounded context window", () => {
    const original = [...block, "tail one", "tail two", "tail three"].join("\n");
    const edited = [...block, "tail one", "unrelated edit", "tail three"].join("\n");
    const readSource = sourceReader({
      "base:src/access.ts": original,
      "head:src/access.ts": edited,
    });

    const [finding] = compare({
      base: [risk(3)],
      head: [risk(3)],
      readSource,
      lineChanged: () => false,
    });

    expect(finding?.classification).toBe("existing");
  });

  it("uses multiset pairing so a duplicate introduced on a changed line is new", () => {
    const repeated = [...block, "gap", "gap", ...block].join("\n");
    const readSource = sourceReader({
      "base:src/access.ts": repeated,
      "head:src/access.ts": repeated,
    });

    const result = compare({
      base: [risk(3)],
      head: [risk(3), risk(11)],
      readSource,
      lineChanged: (_path, line) => line === 11,
    });

    expect(result.map(({ classification }) => classification).sort()).toEqual(["existing", "new"]);
    expect(result.find(({ classification }) => classification === "new")).toMatchObject({
      source: "head",
      line_changed: true,
    });
  });

  it("classifies base-only findings as resolved", () => {
    expect(classifyLoneFinding("base", risk(3)))
      .toMatchObject({ classification: "resolved", source: "base", line_changed: false });
  });

  it("classifies material severity and suppression changes with direction", () => {
    const readSource = sourceReader({
      "base:src/access.ts": block.join("\n"),
      "head:src/access.ts": block.join("\n"),
    });
    const worsened = compare({
      base: [risk(3, { severity: "medium" })],
      head: [risk(3, { severity: "critical" })],
      readSource,
      lineChanged: () => true,
    });
    const improved = compare({
      base: [risk(3)],
      head: [risk(3, { suppression: { id: "accepted", reason: "owned", owner: "security", matched_by: "path" } })],
      readSource,
      lineChanged: () => false,
    });

    expect(worsened[0]).toMatchObject({ classification: "changed", change: "worsened", line_changed: true });
    expect(improved[0]).toMatchObject({ classification: "changed", change: "improved" });
  });

  it("marks a worsened pair outside changed lines as unattributed", () => {
    const readSource = sourceReader({
      "base:src/access.ts": block.join("\n"),
      "head:src/access.ts": block.join("\n"),
    });
    const [finding] = compare({
      base: [risk(3, { severity: "medium" })],
      head: [risk(3, { severity: "critical" })],
      readSource,
      lineChanged: () => false,
    });

    expect(finding).toMatchObject({ classification: "unattributed", change: "worsened", line_changed: false });
  });

  it("marks an unpaired head finding outside changed lines as unattributed", () => {
    expect(classifyLoneFinding("head", risk(3)))
      .toMatchObject({ classification: "unattributed", source: "head", line_changed: false });
  });

  it("emits a deterministic opaque fingerprint and does not change the public finding id", () => {
    const finding = risk(3);
    const source = "API_SECRET=never-emit-this-value";
    const readSource = sourceReader({ "head:src/access.ts": source });
    const first = findingFingerprint(finding, headRoot, readSource);
    const second = findingFingerprint(finding, headRoot, readSource);

    expect(first).toBe(second);
    expect(first).toMatch(/^[0-9a-f]{64}$/u);
    expect(first).not.toContain(source);
    expect(findingId(finding)).toBe("TG-G4:src/access.ts:unguarded tenant access:risk");
  });
});
