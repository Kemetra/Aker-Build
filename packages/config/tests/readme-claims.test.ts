import { describe, it, expect } from "vitest";
import { matchesPathPattern } from "../src/index.js";

/**
 * The README tells users how these patterns behave, and advice that does not match the
 * implementation is worse than no advice. Each case here corresponds to a sentence in
 * README.md's "Scope your scan first" section, including the exclude list it recommends.
 */
describe("pattern behaviour the README documents", () => {
  it("** crosses path segments", () => {
    expect(matchesPathPattern("packages/gates/tests/fixtures/x.ts", "**/tests/**")).toBe(true);
    expect(matchesPathPattern("tests/x.ts", "**/tests/**")).toBe(true);
  });

  it("the recommended exclude list catches test files and fixtures", () => {
    expect(matchesPathPattern("packages/queue/tests/a.test.ts", "**/*.test.ts")).toBe(true);
    expect(matchesPathPattern("fixtures/a/b.ts", "fixtures/**")).toBe(true);
    expect(matchesPathPattern("examples/demo/src/db.ts", "examples/**")).toBe(true);
  });

  it("dir/** matches the directory itself as well as its contents", () => {
    expect(matchesPathPattern("fixtures", "fixtures/**")).toBe(true);
    expect(matchesPathPattern("fixtures/a.ts", "fixtures/**")).toBe(true);
  });

  it("a single star stays within one segment", () => {
    expect(matchesPathPattern("packages/a/x.ts", "packages/*/x.ts")).toBe(true);
    expect(matchesPathPattern("packages/a/b/x.ts", "packages/*/x.ts")).toBe(false);
  });

  it("does not exclude product source", () => {
    // The whole point of scoping is to remove fixtures without hiding real code.
    expect(matchesPathPattern("packages/gates/src/x.ts", "**/tests/**")).toBe(false);
    expect(matchesPathPattern("src/api/routes.ts", "**/*.test.ts")).toBe(false);
  });
});
