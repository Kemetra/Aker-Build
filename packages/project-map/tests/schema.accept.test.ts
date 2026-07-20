import { describe, it, expect } from "vitest";
import { parse as parseYaml } from "yaml";
import { SCHEMA_VERSION, validate } from "../src/index.js";
import { readContract, conformingMap } from "./helpers.js";

describe("T006 accept: conforming maps validate", () => {
  it("accepts a hand-built conforming map (SC-001)", () => {
    const result = validate(conformingMap());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("accepts the canonical SaaS example map", () => {
    const map = parseYaml(readContract("example-map.saas.yaml"));
    const result = validate(map);
    expect(result.ok).toBe(true);
  });

  it("accepts the non-SaaS example map (not_detected + nulls, no fabrication)", () => {
    const map = parseYaml(readContract("example-map.non-saas.yaml"));
    const result = validate(map);
    expect(result.ok).toBe(true);
  });

  it("accepts a multi-repo map with >=2 repos (FR-002, V1)", () => {
    const map = conformingMap();
    map.repos = [
      { name: "api", path: "apps/api", type: "backend", owns: ["auth"] },
      { name: "web", path: "apps/web", type: "frontend", owns: ["admin-ui"] },
      { name: "worker", path: "apps/worker", type: "worker", owns: ["async-jobs"] },
    ];
    const result = validate(map);
    expect(result.ok).toBe(true);
  });

  it("accepts additive v2 framework coverage evidence", () => {
    expect(SCHEMA_VERSION).toBe(2);
    const map = conformingMap();
    map.version = SCHEMA_VERSION;
    map.coverage = {
      source_files_examined: 7,
      packs: [
        { id: "nestjs", capabilities: ["auth", "routes"], matched_files: 2 },
        { id: "prisma", capabilities: ["data_access"], matched_files: 1 },
      ],
    };

    expect(validate(map)).toEqual({ ok: true, errors: [] });
  });
});
