import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { runGates, validateRisks } from "../src/index.js";
import { gatesFixture } from "./helpers.js";

describe("011 config suppressions", () => {
  it("keeps matching suppressed findings visible with auditable metadata", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const configPath = join(repoRoot, "tenantguard.config.json");
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          version: 1,
          gates: {
            "TG-G4": {
              suppressions: [
                {
                  id: "TG-G4-DEMO-001",
                  path: "apps/api/routes/admin.ts",
                  reason: "Known demo fixture violation.",
                  owner: "maintainer",
                  expires: "2026-09-01",
                },
              ],
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const { risks } = runGates(repoRoot, { out: outDir, configPath });
    expect(validateRisks(risks).ok).toBe(true);
    const suppressed = risks.findings.find((f) => f.suppression?.id === "TG-G4-DEMO-001");
    expect(suppressed).toBeDefined();
    expect(suppressed?.status).toBe("risk");
    expect(suppressed?.suppression?.owner).toBe("maintainer");
    expect(suppressed?.suppression?.reason).toBe("Known demo fixture violation.");
  });

  it("applies a configured severity override to unsuppressed risk findings", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const configPath = join(repoRoot, "tenantguard.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ version: 1, gates: { "TG-G5": { severity: "medium" } } }),
      "utf8",
    );

    const { risks } = runGates(repoRoot, { out: outDir, gates: ["TG-G5"], configPath });
    expect(risks.findings.filter((f) => f.status === "risk").every((f) => f.severity === "medium")).toBe(true);
  });

  it("matches non-suffix double-star suppression globs", () => {
    const { repoRoot, outDir } = gatesFixture("vuln");
    const configPath = join(repoRoot, "tenantguard.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({
        version: 1,
        gates: {
          "TG-G4": {
            suppressions: [
              {
                id: "TG-G4-GLOB-001",
                path: "apps/**/*.ts",
                reason: "Known TypeScript route fixture violation.",
                owner: "maintainer",
              },
            ],
          },
        },
      }),
      "utf8",
    );

    const { risks } = runGates(repoRoot, { out: outDir, gates: ["TG-G4"], configPath });
    expect(risks.findings.some((f) => f.suppression?.id === "TG-G4-GLOB-001")).toBe(true);
  });
});
