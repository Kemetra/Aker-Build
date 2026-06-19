import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deriveQueue } from "../src/index.js";
import { fixtureRepo, minimalMap, riskFinding, riskList } from "./helpers.js";

describe("011 Spec Kit context enrichment", () => {
  it("adds Spec Kit artifact evidence to derived queue items and prompts", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([riskFinding("TG-G4", "high", "apps/api/routes/admin.ts", "admin route without a role guard")]),
    );
    mkdirSync(join(repoRoot, ".specify", "memory"), { recursive: true });
    mkdirSync(join(repoRoot, "specs", "011-demo"), { recursive: true });
    writeFileSync(join(repoRoot, ".specify", "memory", "constitution.md"), "# Constitution\n", "utf8");
    writeFileSync(join(repoRoot, "specs", "011-demo", "spec.md"), "# Demo spec\n", "utf8");
    writeFileSync(join(repoRoot, "specs", "011-demo", "plan.md"), "# Demo plan\n", "utf8");
    writeFileSync(join(repoRoot, "specs", "011-demo", "tasks.md"), "# Demo tasks\n", "utf8");

    const queue = deriveQueue(repoRoot, { out: outDir });
    const item = queue.items[0]!;
    expect(item.source.evidence.some((e) => e.path === "specs/011-demo/spec.md")).toBe(true);
  });

  it("still derives queue when Spec Kit artifacts are absent", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([riskFinding("TG-G4", "high", "apps/api/routes/admin.ts", "admin route without a role guard")]),
    );

    const queue = deriveQueue(repoRoot, { out: outDir });
    expect(queue.items).toHaveLength(1);
  });
});
