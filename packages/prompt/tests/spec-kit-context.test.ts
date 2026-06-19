import { describe, it, expect } from "vitest";
import { compileItem } from "../src/index.js";
import { fullItem } from "./helpers.js";

describe("011 Spec Kit prompt context", () => {
  it("renders Spec Kit evidence already carried by queue items", () => {
    const item = fullItem({
      source: {
        evidence: [
          { type: "line", path: "apps/api/routes/admin.ts", line: 42, signal: "admin route without a role guard", confidence: "high" },
          { type: "file", path: "specs/011-demo/spec.md", line: null, signal: "Spec Kit artifact: spec", confidence: "medium" },
        ],
      },
    });

    const prompt = compileItem(item, "codex").markdown;
    expect(prompt).toContain("specs/011-demo/spec.md");
    expect(prompt).toContain("Spec Kit artifact");
  });
});
