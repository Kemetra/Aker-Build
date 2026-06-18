import { describe, it, expect } from "vitest";
import { evidenceSchema } from "../src/index.js";

describe("T009 shared Evidence Object (FR-004b)", () => {
  it("accepts a full evidence object", () => {
    const r = evidenceSchema.safeParse({
      type: "line",
      path: "apps/api/routes.ts",
      line: 42,
      signal: "route_without_auth_guard",
      confidence: "high",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null path + omitted line (path-less evidence: failed_command)", () => {
    const r = evidenceSchema.safeParse({
      type: "failed_command",
      path: null,
      signal: "pnpm_test_failed",
      confidence: "low",
    });
    expect(r.success).toBe(true);
  });

  it("accepts null line explicitly", () => {
    const r = evidenceSchema.safeParse({
      type: "file",
      path: "x.ts",
      line: null,
      signal: "found",
      confidence: "medium",
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown evidence type", () => {
    const r = evidenceSchema.safeParse({
      type: "telepathy",
      path: null,
      signal: "s",
      confidence: "low",
    });
    expect(r.success).toBe(false);
  });

  it("rejects an unknown confidence level", () => {
    const r = evidenceSchema.safeParse({
      type: "file",
      path: "x",
      signal: "s",
      confidence: "certain",
    });
    expect(r.success).toBe(false);
  });

  it("requires type, signal, confidence", () => {
    expect(evidenceSchema.safeParse({ path: "x" }).success).toBe(false);
  });
});
