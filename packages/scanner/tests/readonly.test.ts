import { describe, it, expect } from "vitest";
import { scan } from "../src/index.js";
import { fixture, snapshot } from "./helpers.js";

describe("T008 read-only on scanned repo (SC-002, FR-003)", () => {
  it("does not create, modify, or delete any file in the scanned repo", () => {
    const root = fixture("saas");
    const before = snapshot(root);
    // Output goes to a temp dir OUTSIDE the scanned repo's tracked source.
    scan(root, { out: fixture("saas") + "-out" });
    const after = snapshot(root);
    expect([...after.entries()]).toEqual([...before.entries()]);
  });
});
