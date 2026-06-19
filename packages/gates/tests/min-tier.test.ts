import { describe, it, expect } from "vitest";
import type { TenantGuardConfig } from "@tenantguard/config";
import { applyConfigToRisks } from "../src/suppressions.js";
import type { RiskList } from "../src/types.js";

const ev = (confidence: "high" | "medium" | "low") => ({
  type: "line" as const,
  path: "apps/api/x.ts",
  line: 1,
  signal: "s",
  confidence,
});

const risks = (...findings: RiskList["findings"]): RiskList => ({ schema_version: 1, findings });

describe("P2 config: per-gate min_tier", () => {
  it("suppresses a suspected finding below min_tier=confirmed WITH an audited record (never silent)", () => {
    const input = risks({
      gate_id: "TG-G7",
      status: "risk",
      severity: "low",
      evidence: [ev("medium")], // tier = suspected
    });
    const config: TenantGuardConfig = {
      version: 1,
      gates: { "TG-G7": { min_tier: "confirmed" } },
    };
    const out = applyConfigToRisks(input, config);
    expect(out.findings).toHaveLength(1); // still present, not dropped
    expect(out.findings[0]?.suppression).toBeDefined();
    expect(out.findings[0]?.suppression?.reason).toContain("min_tier");
  });

  it("leaves a confirmed finding untouched under min_tier=confirmed", () => {
    const input = risks({
      gate_id: "TG-G7",
      status: "risk",
      severity: "low",
      evidence: [ev("high")], // tier = confirmed
    });
    const config: TenantGuardConfig = {
      version: 1,
      gates: { "TG-G7": { min_tier: "confirmed" } },
    };
    const out = applyConfigToRisks(input, config);
    expect(out.findings[0]?.suppression).toBeUndefined();
  });

  it("no config → surfaces everything (no suppression)", () => {
    const input = risks({
      gate_id: "TG-G7",
      status: "risk",
      severity: "low",
      evidence: [ev("medium")],
    });
    const out = applyConfigToRisks(input, { version: 1 });
    expect(out.findings[0]?.suppression).toBeUndefined();
  });
});
