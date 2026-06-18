import { describe, it, expect } from "vitest";
import { evidenceSchema } from "../src/index.js";

// FR-011 / SC-006: the schema provides no field intended to hold a raw secret value.
// The Evidence Object carries signal/path (where/what), never the secret itself.
describe("T010 secret safety (FR-011)", () => {
  it("evidence schema has no 'secret'/'value'/'credential' field in its shape", () => {
    const shape = (evidenceSchema as unknown as { shape: Record<string, unknown> }).shape;
    const keys = Object.keys(shape);
    expect(keys).not.toContain("secret");
    expect(keys).not.toContain("value");
    expect(keys).not.toContain("credential");
    expect(keys.sort()).toEqual(["confidence", "line", "path", "signal", "type"]);
  });

  it("an extra 'secret' field on an evidence object is stripped, not retained", () => {
    const r = evidenceSchema.safeParse({
      type: "file",
      path: "config.ts",
      signal: "hardcoded_secret_detected",
      confidence: "high",
      secret: "sk-live-PLEASE-DO-NOT-KEEP",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data).not.toHaveProperty("secret");
      expect(JSON.stringify(r.data)).not.toContain("sk-live");
    }
  });
});
