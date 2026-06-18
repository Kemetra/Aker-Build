import { describe, it, expect } from "vitest";
import { validate } from "@tenantguard/project-map";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("T017 empty / non-SaaS repos -> valid honest map (SC-004)", () => {
  for (const name of ["empty", "nonsaas"]) {
    it(`${name}: 002-valid, empty collections, no fabrication`, () => {
      const { map, notes } = scan(fixture(name));
      expect(validate(map).ok).toBe(true);
      expect(map.tenant_model.status).toBe("not_detected");
      expect(map.tenant_model.strategy).toBeNull();
      expect(map.boundaries).toEqual([]);
      expect(notes.some((n) => n.kind === "insufficient_evidence")).toBe(true);
    });
  }

  it("empty repo: stack fields null/empty, not guessed", () => {
    const { map } = scan(fixture("empty"));
    expect(map.project.detected_stack.runtime).toBeNull();
    expect(map.project.detected_stack.frameworks).toEqual([]);
    expect(map.repos.length).toBe(0);
  });
});
