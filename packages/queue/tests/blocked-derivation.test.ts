import { describe, it, expect } from "vitest";
import { deriveQueue } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList, needsVerificationFinding } from "./helpers.js";

describe("T010 blocked-derivation (US1 #3)", () => {
  it("a needs_verification finding becomes a blocked item, not ready", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([needsVerificationFinding("TG-G2", "no diff evidence for contract drift")]),
    );
    const queue = deriveQueue(repoRoot, { out: outDir });
    expect(queue.items.length).toBe(1);
    expect(queue.items[0]!.status).toBe("blocked");
    expect(queue.items[0]!.blocked_reason).toMatch(/needs verification|insufficient evidence/i);
  });

  it("a not_applicable finding produces no item", () => {
    const naFinding = {
      gate_id: "TG-G6",
      status: "not_applicable" as const,
      severity: null,
      evidence: [],
    };
    const { repoRoot, outDir } = fixtureRepo(minimalMap(), riskList([naFinding]));
    const queue = deriveQueue(repoRoot, { out: outDir });
    expect(queue.items.length).toBe(0);
  });
});
