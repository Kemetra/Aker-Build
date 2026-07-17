import { describe, it, expect, afterEach } from "vitest";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "node:fs";
import { runPromptCommand } from "../src/commands/prompt.js";

const ITEM = {
  id: "Q-001",
  title: "Fix: admin route without a role guard",
  status: "ready",
  type: "implementation",
  source: { evidence: [{ type: "line", path: "a.ts", line: 1, signal: "x", confidence: "high" }] },
  priority: "high",
  risk: "medium",
  depends_on: [],
  lock_scope: { files: ["a.ts"] },
  allowed_files: ["a.ts"],
  forbidden_files: [],
  gates: ["TG-G4"],
  validation: ["pnpm -r test"],
  stop_conditions: ["tests fail"],
  final_report: { required: ["Files changed"] },
};
const QUEUE = { schema_version: 1, items: [ITEM] };

function repo(opts: { withQueue?: boolean } = {}): { outDir: string; root: string } {
  const root = mkdtempSync(join(tmpdir(), "tg-cli-prompt-"));
  const outDir = join(root, ".aker-build");
  mkdirSync(outDir, { recursive: true });
  if (opts.withQueue !== false) writeFileSync(join(outDir, "queue.json"), JSON.stringify(QUEUE), "utf8");
  return { outDir, root };
}

const created: string[] = [];
afterEach(() => {
  for (const p of created) if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  created.length = 0;
});

describe("T024 `aker-build prompt` command", () => {
  it("compiles a prompt, writes prompt-<id>.md + prints it, exits 0", () => {
    const { outDir, root } = repo();
    created.push(root);
    const lines: string[] = [];
    const code = runPromptCommand("Q-001", { out: outDir, sink: (s) => lines.push(s), errSink: () => {} });
    expect(code).toBe(0);
    const file = join(outDir, "prompt-Q-001.md");
    expect(existsSync(file)).toBe(true);
    expect(readFileSync(file, "utf8")).toContain("## Git rules");
    expect(lines.join("\n")).toContain("## Objective");
  });

  it("exits 1 with 'run queue first' when queue.json is missing", () => {
    const { outDir, root } = repo({ withQueue: false });
    created.push(root);
    const lines: string[] = [];
    const code = runPromptCommand("Q-001", { out: outDir, errSink: (s) => lines.push(s) });
    expect(code).toBe(1);
    expect(lines.join("\n")).toMatch(/queue/i);
  });

  it("exits 2 on an unknown queue item id", () => {
    const { outDir, root } = repo();
    created.push(root);
    const code = runPromptCommand("Q-999", { out: outDir, errSink: () => {} });
    expect(code).toBe(2);
  });

  it("--stdout prints the prompt without writing a file", () => {
    const { outDir, root } = repo();
    created.push(root);
    const lines: string[] = [];
    const code = runPromptCommand("Q-001", { out: outDir, stdout: true, sink: (s) => lines.push(s), errSink: () => {} });
    expect(code).toBe(0);
    expect(existsSync(join(outDir, "prompt-Q-001.md"))).toBe(false);
    expect(lines.join("\n")).toContain("## Validation commands");
  });
});
