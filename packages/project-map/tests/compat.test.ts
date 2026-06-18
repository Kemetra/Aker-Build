import { describe, it, expect } from "vitest";
import { validate } from "../src/index.js";
import { conformingMap } from "./helpers.js";

describe("T016 forward/backward compatibility (FR-006, FR-007)", () => {
  it("tolerates an unknown extra top-level field (ignored, never a crash) — SC-004", () => {
    const map = conformingMap();
    (map as Record<string, unknown>).future_field = { anything: true };
    const result = validate(map);
    expect(result.ok).toBe(true);
  });

  it("tolerates an unknown nested field without failing", () => {
    const map = conformingMap();
    (map.project as Record<string, unknown>).future_nested = "x";
    const result = validate(map);
    expect(result.ok).toBe(true);
  });

  it("keeps a previously-conforming (older) map valid after an additive change — SC-003", () => {
    // An older map that lacks the optional 'metadata' field still validates.
    const older = conformingMap();
    expect("metadata" in older).toBe(false);
    expect(validate(older).ok).toBe(true);
  });
});
