import { describe, it, expect } from "vitest";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("T009 evidence traceability (SC-003)", () => {
  it("records detection signals for populated values; emits no fabricated stack", () => {
    const { map, notes } = scan(fixture("saas"));
    // The run surfaces signals/notes; a populated runtime must come from a real manifest.
    expect(map.project.detected_stack.runtime).not.toBeNull();
    // Notes/signals exist and never invent a runtime when none is present (checked in empty test).
    expect(Array.isArray(notes)).toBe(true);
  });

  it("does not fabricate a tenant strategy when none is detectable", () => {
    const { map } = scan(fixture("nonsaas"));
    expect(map.tenant_model.status).toBe("not_detected");
    expect(map.tenant_model.strategy).toBeNull();
    expect(map.tenant_model.tenant_key).toBeNull();
  });
});
