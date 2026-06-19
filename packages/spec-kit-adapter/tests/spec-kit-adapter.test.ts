import { describe, it, expect } from "vitest";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readSpecKitArtifacts } from "../src/index.js";

function repo(): string {
  return mkdtempSync(join(tmpdir(), "tg-speckit-"));
}

describe("Spec Kit adapter", () => {
  it("returns an empty context when Spec Kit artifacts are absent", () => {
    const context = readSpecKitArtifacts(repo());
    expect(context.present).toBe(false);
    expect(context.artifacts).toEqual([]);
    expect(context.evidence).toEqual([]);
  });

  it("reads constitution, spec, plan, tasks, and checklists as file evidence", () => {
    const root = repo();
    mkdirSync(join(root, ".specify", "memory"), { recursive: true });
    mkdirSync(join(root, "specs", "001-demo", "checklists"), { recursive: true });
    writeFileSync(join(root, ".specify", "memory", "constitution.md"), "# Constitution\n", "utf8");
    writeFileSync(join(root, "specs", "001-demo", "spec.md"), "# Spec\nAllowed files\n", "utf8");
    writeFileSync(join(root, "specs", "001-demo", "plan.md"), "# Plan\n", "utf8");
    writeFileSync(join(root, "specs", "001-demo", "tasks.md"), "# Tasks\n", "utf8");
    writeFileSync(join(root, "specs", "001-demo", "checklists", "requirements.md"), "# Checklist\n", "utf8");

    const context = readSpecKitArtifacts(root);
    expect(context.present).toBe(true);
    expect(context.artifacts.map((a) => a.path).sort()).toEqual([
      ".specify/memory/constitution.md",
      "specs/001-demo/checklists/requirements.md",
      "specs/001-demo/plan.md",
      "specs/001-demo/spec.md",
      "specs/001-demo/tasks.md",
    ]);
    expect(context.evidence.some((e) => e.path === "specs/001-demo/spec.md")).toBe(true);
  });

  it("flags secret-like content without copying the value into summaries or evidence", () => {
    const root = repo();
    mkdirSync(join(root, "specs", "001-demo"), { recursive: true });
    writeFileSync(
      join(root, "specs", "001-demo", "spec.md"),
      "api_key = '0123456789abcdef0123456789abcdef'",
      "utf8",
    );

    const context = readSpecKitArtifacts(root);
    expect(context.artifacts[0]?.secretLike).toBe(true);
    expect(context.artifacts[0]?.summary).toContain("secret-like content");
    expect(context.artifacts[0]?.summary).not.toContain("0123456789abcdef");
    expect(context.evidence[0]?.signal).not.toContain("0123456789abcdef");
  });
});
