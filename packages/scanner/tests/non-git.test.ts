import { describe, it, expect } from "vitest";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("T019 non-Git directory is reported clearly (edge case)", () => {
  it("throws / signals out-of-MVP-scope rather than producing a misleading map", () => {
    expect(() => scan(fixture("notgit"))).toThrowError(/git/i);
  });
});
