import { describe, it, expect } from "vitest";
import { deriveQueueToFile, routeToFile } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList, riskFinding } from "./helpers.js";

describe("T011 secret safety (SC-007)", () => {
  it("no secret value appears in queue.json or route.json output", () => {
    // Evidence signal names the pattern only — never the value (inherited from 002/004).
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([riskFinding("TG-G4", "critical", "src/log.ts", "secret-like value printed in logs")]),
    );
    const { queue } = deriveQueueToFile(repoRoot, { out: outDir });
    const { decision } = routeToFile(repoRoot, { out: outDir });

    const serialized = JSON.stringify(queue) + JSON.stringify(decision);
    // The signal name is allowed; a raw secret-looking token must not be present.
    expect(serialized).toContain("secret-like value printed in logs");
    expect(serialized).not.toMatch(/AKIA[0-9A-Z]{16}/); // no AWS-key-shaped tokens
    expect(serialized).not.toMatch(/password\s*=/i);
  });
});
