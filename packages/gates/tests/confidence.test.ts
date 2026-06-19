import { describe, it, expect } from "vitest";
import { confidenceTier } from "../src/confidence.js";
import type { Finding } from "../src/types.js";

const ev = (confidence: "high" | "medium" | "low") => ({
  type: "line" as const,
  path: "f.ts",
  line: 1,
  signal: "s",
  confidence,
});
const risk = (...c: ("high" | "medium" | "low")[]): Finding => ({
  gate_id: "TG-G4",
  status: "risk",
  severity: "high",
  evidence: c.map(ev),
});

describe("confidenceTier", () => {
  it("confirmed when any evidence is high", () => {
    expect(confidenceTier(risk("medium", "high"))).toBe("confirmed");
  });
  it("confirmed when all high", () => {
    expect(confidenceTier(risk("high", "high"))).toBe("confirmed");
  });
  it("suspected when only medium/low", () => {
    expect(confidenceTier(risk("medium", "low"))).toBe("suspected");
  });
  it("suspected when evidence is empty (no proof)", () => {
    expect(
      confidenceTier({ gate_id: "TG-G4", status: "risk", severity: "high", evidence: [] }),
    ).toBe("suspected");
  });
});
