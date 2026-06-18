import { describe, it, expect } from "vitest";
import { validate } from "../src/index.js";
import { conformingMap } from "./helpers.js";

const REQUIRED_TOP_LEVEL = [
  "version",
  "project",
  "repos",
  "boundaries",
  "tenant_model",
  "critical_surfaces",
];

describe("T007 reject: missing required fields name the field path (SC-002)", () => {
  for (const field of REQUIRED_TOP_LEVEL) {
    it(`rejects a map missing '${field}' and names it`, () => {
      const map = conformingMap();
      delete map[field];
      const result = validate(map);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.path === field || e.path.startsWith(field))).toBe(true);
    });
  }

  describe("FR-003: detected_stack present-but-empty vs missing (V2)", () => {
    it("accepts detected_stack with null/empty fields (present, not fabricated)", () => {
      const map = conformingMap();
      (map.project as Record<string, unknown>).detected_stack = {
        runtime: null,
        package_manager: null,
        frameworks: [],
      };
      const result = validate(map);
      expect(result.ok).toBe(true);
    });

    it("rejects a map missing detected_stack entirely, naming project.detected_stack", () => {
      const map = conformingMap();
      delete (map.project as Record<string, unknown>).detected_stack;
      const result = validate(map);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.path.includes("detected_stack"))).toBe(true);
    });
  });
});
