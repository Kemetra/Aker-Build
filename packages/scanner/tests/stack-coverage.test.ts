import { describe, it, expect } from "vitest";
import { partitionCoverage } from "../src/detect/stack.js";

describe("partitionCoverage", () => {
  it("splits detected frameworks into covered and uncovered", () => {
    expect(partitionCoverage(["express", "nextjs", "react"])).toEqual({
      covered: ["express"],
      uncovered: ["nextjs", "react"],
    });
  });

  it("returns empty lists when no frameworks were detected", () => {
    expect(partitionCoverage([])).toEqual({ covered: [], uncovered: [] });
  });

  it("reports everything uncovered when no detected framework is supported", () => {
    expect(partitionCoverage(["vue", "svelte"])).toEqual({
      covered: [],
      uncovered: ["svelte", "vue"],
    });
  });
});
