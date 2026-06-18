import { describe, it, expect } from "vitest";
import { deriveQueue } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList, riskFinding } from "./helpers.js";

describe("T009 evidence-trace (SC-002)", () => {
  it("every finding-derived item traces to the finding's source evidence", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([riskFinding("TG-G4", "high", "apps/api/routes/admin.ts", "admin route without a role guard")]),
    );
    const queue = deriveQueue(repoRoot, { out: outDir });
    const item = queue.items[0]!;
    expect(item.source.evidence[0]!.path).toBe("apps/api/routes/admin.ts");
    expect(item.source.evidence[0]!.signal).toMatch(/role guard/);
    // lock scope + allowed files seeded from the evidence path
    expect(item.lock_scope.files).toContain("apps/api/routes/admin.ts");
    expect(item.allowed_files).toContain("apps/api/routes/admin.ts");
  });
});
