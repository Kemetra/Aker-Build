import { describe, it, expect } from "vitest";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("T018 robustness (FR-009)", () => {
  it("scans the SaaS fixture without throwing (no crash on normal input)", () => {
    expect(() => scan(fixture("saas"))).not.toThrow();
  });

  it("produces a notes array on every run", () => {
    const { notes } = scan(fixture("saas"));
    expect(Array.isArray(notes)).toBe(true);
  });
});
