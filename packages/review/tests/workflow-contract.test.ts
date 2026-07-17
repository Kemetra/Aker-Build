import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("PR Action comparison contract", () => {
  it("checks out full history so both API OIDs can be archived locally", () => {
    const workflow = readFileSync(
      fileURLToPath(new URL("../../../.github/workflows/aker-build.yml", import.meta.url)),
      "utf8",
    );
    const reviewJob = workflow.slice(workflow.indexOf("  review:"), workflow.indexOf("  quality:"));
    expect(reviewJob).toContain("fetch-depth: 0");
  });
});
