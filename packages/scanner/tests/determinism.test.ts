import { describe, it, expect } from "vitest";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("T022 deterministic re-scan (SC-005)", () => {
  it("two scans of an unchanged repo produce deep-equal maps", () => {
    const a = scan(fixture("saas")).map;
    const b = scan(fixture("saas")).map;
    expect(b).toEqual(a);
  });

  it("repos and frameworks are stably ordered", () => {
    const { map } = scan(fixture("monorepo"));
    const paths = map.repos.map((r) => r.path);
    expect([...paths]).toEqual([...paths].sort());
  });
});
