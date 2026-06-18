import { describe, it, expect } from "vitest";
import { deriveQueueToFile, route } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList, riskFinding } from "./helpers.js";

describe("T024 deterministic decision (SC-005)", () => {
  it("two routing runs over unchanged input produce the same decision", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([
        riskFinding("TG-G4", "high", "a.ts", "route without auth guard"),
        riskFinding("TG-G5", "high", "b.ts", "webhook without idempotency"),
        riskFinding("TG-G1", "medium", "c.ts", "boundary violation"),
      ]),
    );
    deriveQueueToFile(repoRoot, { out: outDir });
    const a = route(repoRoot, { out: outDir });
    const b = route(repoRoot, { out: outDir });
    expect(b).toEqual(a);
  });

  it("the derived queue is stably ordered by id", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([
        riskFinding("TG-G4", "high", "a.ts", "x"),
        riskFinding("TG-G5", "high", "b.ts", "y"),
      ]),
    );
    const { queue } = deriveQueueToFile(repoRoot, { out: outDir });
    const ids = queue.items.map((i) => i.id);
    expect([...ids]).toEqual([...ids].sort());
  });
});
