import { describe, it, expect } from "vitest";
import { validate } from "@tenantguard/project-map";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("T010 monorepo layout -> multiple repos[] (FR-007)", () => {
  it("detects >=2 repos for an apps/* + packages/* monorepo", () => {
    const { map } = scan(fixture("monorepo"));
    expect(validate(map).ok).toBe(true);
    expect(map.repos.length).toBeGreaterThanOrEqual(2);
    const paths = map.repos.map((r) => r.path).sort();
    expect(paths).toContain("apps/api");
    expect(paths).toContain("packages/core");
  });
});
