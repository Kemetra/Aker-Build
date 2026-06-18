import { describe, it, expect } from "vitest";
import { validate } from "../src/index.js";
import { conformingMap } from "./helpers.js";

type Obj = Record<string, unknown>;

describe("T008 tenant_model honesty rule (FR-004a)", () => {
  it("accepts status=detected with a concrete strategy + tenant_key", () => {
    expect(validate(conformingMap()).ok).toBe(true);
  });

  for (const status of ["not_detected", "unknown", "not_applicable"]) {
    it(`accepts status=${status} with null strategy and null tenant_key`, () => {
      const map = conformingMap();
      map.tenant_model = {
        status,
        strategy: null,
        tenant_key: null,
        required_surfaces: [],
      };
      expect(validate(map).ok).toBe(true);
    });

    it(`rejects status=${status} with a fabricated strategy, naming tenant_model.strategy`, () => {
      const map = conformingMap();
      map.tenant_model = {
        status,
        strategy: "separate_db",
        tenant_key: null,
        required_surfaces: [],
      };
      const result = validate(map);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.path.includes("tenant_model.strategy"))).toBe(true);
    });

    it(`rejects status=${status} with a fabricated tenant_key, naming tenant_model.tenant_key`, () => {
      const map = conformingMap();
      map.tenant_model = {
        status,
        strategy: null,
        tenant_key: "tenant_id",
        required_surfaces: [],
      };
      const result = validate(map);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.path.includes("tenant_model.tenant_key"))).toBe(true);
    });
  }

  it("rejects an invalid status value", () => {
    const map = conformingMap();
    (map.tenant_model as Obj).status = "maybe";
    expect(validate(map).ok).toBe(false);
  });
});
