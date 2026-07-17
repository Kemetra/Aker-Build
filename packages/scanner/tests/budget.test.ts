import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  ScanBudgetExceededError,
  ScanBudgetTracker,
  listFiles,
  readFileSafe,
  runWithScanBudget,
  scan,
} from "../src/index.js";

const roots: string[] = [];

function fixture(): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-budget-"));
  roots.push(root);
  mkdirSync(join(root, ".git"));
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    if (existsSync(root)) rmSync(root, { recursive: true, force: true });
  }
});

describe("shared scan budget", () => {
  it("counts each considered path once and fails closed above maxFiles", () => {
    const root = fixture();
    writeFileSync(join(root, "a.ts"), "a");
    writeFileSync(join(root, "b.ts"), "b");
    writeFileSync(join(root, "c.ts"), "c");
    const tracker = new ScanBudgetTracker({ maxFiles: 2, maxFileBytes: 1024, maxTotalBytes: 4096 });

    expect(() => runWithScanBudget(tracker, () => listFiles(root))).toThrowError(
      expect.objectContaining({ reason: "file_count" }),
    );
    expect(tracker.snapshot().filesConsidered).toBe(3);
  });

  it("rejects an individual readable file before reading its content", () => {
    const root = fixture();
    writeFileSync(join(root, "large.ts"), "x".repeat(65));
    const tracker = new ScanBudgetTracker({ maxFiles: 10, maxFileBytes: 64, maxTotalBytes: 1024 });

    expect(() => runWithScanBudget(tracker, () => readFileSafe(root, "large.ts"))).toThrowError(
      expect.objectContaining({ reason: "file_bytes" }),
    );
    expect(tracker.snapshot()).toMatchObject({ filesRead: 0, bytesRead: 0 });
  });

  it("enforces aggregate bytes across repeated scanner IO calls", () => {
    const root = fixture();
    writeFileSync(join(root, "a.ts"), "a".repeat(40));
    writeFileSync(join(root, "b.ts"), "b".repeat(40));
    const tracker = new ScanBudgetTracker({ maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 64 });

    expect(() =>
      runWithScanBudget(tracker, () => {
        expect(readFileSafe(root, "a.ts")).toHaveLength(40);
        readFileSafe(root, "b.ts");
      }),
    ).toThrowError(expect.objectContaining({ reason: "total_bytes" }));
    expect(tracker.snapshot()).toMatchObject({ filesRead: 1, bytesRead: 40 });
  });

  it("uses one async context and exposes bounded, numeric usage", async () => {
    const root = fixture();
    writeFileSync(join(root, "a.ts"), "hello");
    const tracker = new ScanBudgetTracker({ maxFiles: 10, maxFileBytes: 100, maxTotalBytes: 100 });

    await runWithScanBudget(tracker, async () => {
      await Promise.resolve();
      expect(readFileSafe(root, "a.ts")).toBe("hello");
    });

    expect(tracker.snapshot()).toEqual({ filesConsidered: 0, filesRead: 1, bytesRead: 5 });
  });

  it("keeps the existing CLI scan path unbounded by default", () => {
    const root = fixture();
    writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture" }));
    writeFileSync(join(root, "large.ts"), "x".repeat(1024));

    const result = scan(root);
    expect(result.map.project.name).not.toBe("");
    expect(result.usage.filesConsidered).toBeGreaterThanOrEqual(2);
    expect(result.usage.bytesRead).toBeGreaterThan(0);
  });

  it("uses a fixed, source-free budget error message", () => {
    const error = new ScanBudgetExceededError("file_bytes");
    expect(error.message).toBe("scan budget exceeded: file_bytes");
    expect(error.message).not.toContain(".ts");
  });
});
