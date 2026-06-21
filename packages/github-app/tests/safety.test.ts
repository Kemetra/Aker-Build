import { describe, it, expect } from "vitest";
import { assertAllowedWrite, ForbiddenWriteError, ALLOWED_WRITES } from "../src/safety.js";

describe("write allowlist (FR-007 / FR-014 — the safety boundary)", () => {
  it("permits the only two allowed writes", () => {
    expect(() => assertAllowedWrite("checks.create")).not.toThrow();
    expect(() => assertAllowedWrite("checks.update")).not.toThrow();
  });

  it("the allowlist is exactly checks.create + checks.update", () => {
    expect([...ALLOWED_WRITES].sort()).toEqual(["checks.create", "checks.update"]);
  });

  it.each([
    "git.commit",
    "git.push",
    "pulls.merge",
    "issues.addLabels",
    "pulls.update",
    "pulls.createReview",
    "repos.createOrUpdateFileContents",
    "git.updateRef",
  ])("blocks forbidden repository write %s", (op) => {
    expect(() => assertAllowedWrite(op)).toThrow(ForbiddenWriteError);
  });

  it("error names the blocked operation and the report-only constraint", () => {
    try {
      assertAllowedWrite("pulls.merge");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenWriteError);
      expect((e as Error).message).toContain("pulls.merge");
      expect((e as Error).message).toContain("Checks run");
    }
  });
});
