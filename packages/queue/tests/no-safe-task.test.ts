import { describe, it, expect } from "vitest";
import { route, deriveQueueToFile } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList, needsVerificationFinding } from "./helpers.js";

describe("T018 no-safe-task (FR-007)", () => {
  it("an all-blocked queue yields next:null + non-empty no_safe_task_reasons", () => {
    // All findings are needs_verification → all items blocked → nothing safe.
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([
        needsVerificationFinding("TG-G2", "no diff evidence"),
        needsVerificationFinding("TG-G8", "no lockfile diff"),
      ]),
    );
    deriveQueueToFile(repoRoot, { out: outDir });
    const decision = route(repoRoot, { out: outDir });

    expect(decision.next).toBeNull();
    expect(decision.no_safe_task_reasons.length).toBeGreaterThanOrEqual(1);
    expect(decision.blocked.length).toBe(2);
  });

  it("an empty queue yields next:null with an 'empty' reason", () => {
    const { repoRoot, outDir } = fixtureRepo(minimalMap(), riskList([]));
    deriveQueueToFile(repoRoot, { out: outDir });
    const decision = route(repoRoot, { out: outDir });
    expect(decision.next).toBeNull();
    expect(decision.no_safe_task_reasons.join(" ")).toMatch(/empty/i);
  });
});
