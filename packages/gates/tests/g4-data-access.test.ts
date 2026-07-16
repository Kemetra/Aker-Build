import { describe, it, expect } from "vitest";
import { gatesFixture } from "./helpers.js";
import { buildContext } from "../src/context.js";
import { g4Security } from "../src/gates/g4-security.js";
import { confidenceTier } from "../src/confidence.js";

describe("G4 consumes project-map data_access evidence", () => {
  it("emits a suspected-tier risk for a no_tenant_filter query site", () => {
    const { repoRoot, outDir } = gatesFixture("data-access");
    const ctx = buildContext(repoRoot, outDir);
    const findings = g4Security.run(ctx);

    const tenant = findings.filter((f) =>
      f.evidence.some((e) => e.signal.includes("tenant filter")),
    );
    expect(tenant).toHaveLength(1);
    expect(tenant[0]!.status).toBe("risk");
    expect(tenant[0]!.severity).toBe("high");
    expect(tenant[0]!.evidence[0]!.path).toBe("src/db.ts");
    expect(tenant[0]!.evidence[0]!.line).toBe(2);
    expect(confidenceTier(tenant[0]!)).toBe("suspected");
  });

  it("does not flag the tenant_scoped query site", () => {
    const { repoRoot, outDir } = gatesFixture("data-access");
    const ctx = buildContext(repoRoot, outDir);
    const findings = g4Security.run(ctx);
    const onLine9 = findings.filter((f) => f.evidence.some((e) => e.line === 9));
    expect(onLine9).toHaveLength(0);
  });
});
