import { describe, it, expect } from "vitest";
import { route } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList, riskFinding } from "./helpers.js";
import { deriveQueueToFile } from "../src/index.js";

describe("T017 route-one (SC-003, SC-004)", () => {
  it("returns exactly one next with a reason; blocked items each have a reason", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([
        riskFinding("TG-G4", "high", "a.ts", "route without auth guard"),
        riskFinding("TG-G5", "medium", "b.ts", "webhook without idempotency"),
      ]),
    );
    deriveQueueToFile(repoRoot, { out: outDir });
    const decision = route(repoRoot, { out: outDir });

    expect(decision.next).not.toBeNull();
    expect(decision.next!.reason.length).toBeGreaterThanOrEqual(1);
    expect(decision.no_safe_task_reasons).toEqual([]);
    for (const b of decision.blocked) expect(b.reason.length).toBeGreaterThan(0);
  });

  it("the chosen next is one of the queue items", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([riskFinding("TG-G4", "high", "a.ts", "route without auth guard")]),
    );
    const { queue } = deriveQueueToFile(repoRoot, { out: outDir });
    const decision = route(repoRoot, { out: outDir });
    expect(queue.items.map((i) => i.id)).toContain(decision.next!.id);
  });
});
