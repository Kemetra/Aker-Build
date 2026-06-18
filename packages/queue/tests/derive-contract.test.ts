import { describe, it, expect } from "vitest";
import { deriveQueue, validateQueue, QUEUE_ITEM_STATUSES, QUEUE_ITEM_TYPES } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList, riskFinding } from "./helpers.js";

describe("T008 derive-contract (SC-001)", () => {
  it("every item carries the full contract + valid enums; queue validates against queueSchema", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([
        riskFinding("TG-G4", "high", "apps/api/routes/admin.ts", "admin route without a role guard"),
        riskFinding("TG-G3", "medium", "migrations/001.sql", "destructive migration"),
      ]),
    );
    const queue = deriveQueue(repoRoot, { out: outDir });

    expect(validateQueue(queue).ok).toBe(true);
    expect(queue.items.length).toBe(2);
    for (const it of queue.items) {
      expect(it.id).toMatch(/^Q-\d{3}$/);
      expect(QUEUE_ITEM_STATUSES).toContain(it.status);
      expect(QUEUE_ITEM_TYPES).toContain(it.type);
      expect(it.source.evidence.length).toBeGreaterThanOrEqual(1);
      expect(it.gates.length).toBeGreaterThanOrEqual(1);
      expect(it.validation.length).toBeGreaterThanOrEqual(1);
      expect(it.stop_conditions.length).toBeGreaterThanOrEqual(1);
      expect(it.final_report.required.length).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(it.allowed_files)).toBe(true);
      expect(Array.isArray(it.forbidden_files)).toBe(true);
    }
  });

  it("maps gate to type (TG-G3 -> migration)", () => {
    const { repoRoot, outDir } = fixtureRepo(
      minimalMap(),
      riskList([riskFinding("TG-G3", "high", "migrations/001.sql", "destructive migration")]),
    );
    const queue = deriveQueue(repoRoot, { out: outDir });
    expect(queue.items[0]!.type).toBe("migration");
  });
});
