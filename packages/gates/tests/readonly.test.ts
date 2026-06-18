import { describe, it, expect } from "vitest";
import { runGates } from "../src/index.js";
import { gatesFixture, snapshot } from "./helpers.js";

describe("T011 read-only on scanned repo (FR-008)", () => {
  it("does not create, modify, or delete any source file in the scanned repo", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const before = snapshot(repoRoot);
    runGates(repoRoot, { out: outDir });
    const after = snapshot(repoRoot);
    expect([...after.entries()]).toEqual([...before.entries()]);
  });
});
