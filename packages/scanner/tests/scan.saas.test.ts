import { describe, it, expect } from "vitest";
import { validate } from "@tenantguard/project-map";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("T007 scan SaaS fixture -> 002-conforming map (SC-001)", () => {
  it("produces a map that validates against @tenantguard/project-map", () => {
    const { map } = scan(fixture("saas"));
    const result = validate(map);
    expect(result.ok).toBe(true);
  });

  it("detects node + pnpm + frameworks from manifests", () => {
    const { map } = scan(fixture("saas"));
    expect(map.project.detected_stack.runtime).toBe("node");
    expect(map.project.detected_stack.package_manager).toBe("pnpm");
    expect(map.project.detected_stack.frameworks.length).toBeGreaterThan(0);
  });
});
