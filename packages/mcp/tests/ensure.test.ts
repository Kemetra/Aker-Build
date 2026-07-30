import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync, utimesSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { ensureChain } from "../src/ensure.js";

/** A minimal git repo with one unguarded admin route, so the chain produces a queue item. */
function repo(): string {
  const root = mkdtempSync(join(tmpdir(), "aker-mcp-ensure-"));
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "package.json"), `{"name":"t","dependencies":{"express":"^4"}}`);
  writeFileSync(join(root, "src/a.ts"), `app.get("/admin/x", (q, r) => r.json({}));\n`);
  const git = (...args: string[]): void => {
    execFileSync("git", ["-C", root, ...args], { stdio: "ignore" });
  };
  git("init", "--quiet");
  git("config", "user.email", "t@example.test");
  git("config", "user.name", "t");
  git("config", "commit.gpgsign", "false");
  git("add", "-A");
  git("commit", "--quiet", "-m", "baseline");
  return root;
}

describe("ensureChain", () => {
  it("derives the chain when no artifacts exist", () => {
    const root = repo();
    const out = join(root, ".out");
    const res = ensureChain(root, { out });
    expect(res.refreshed).toBe(true);
    expect(res.ageMs).toBe(0);
    expect(existsSync(join(out, "queue.json"))).toBe(true);
  });

  it("reuses artifacts younger than the ttl", () => {
    const root = repo();
    const out = join(root, ".out");
    ensureChain(root, { out });
    const res = ensureChain(root, { out, ttlMs: 60_000 });
    expect(res.refreshed).toBe(false);
    expect(res.ageMs).toBeGreaterThanOrEqual(0);
  });

  it("re-derives when artifacts are older than the ttl", () => {
    const root = repo();
    const out = join(root, ".out");
    ensureChain(root, { out });
    const stale = new Date(Date.now() - 3_600_000);
    utimesSync(join(out, "queue.json"), stale, stale);
    const res = ensureChain(root, { out, ttlMs: 1_000 });
    expect(res.refreshed).toBe(true);
  });

  it("does not write to stdout — stdout is the JSON-RPC channel", () => {
    const root = repo();
    const written: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    // @ts-expect-error narrow test double
    process.stdout.write = (chunk: string): boolean => {
      written.push(String(chunk));
      return true;
    };
    try {
      ensureChain(root, { out: join(root, ".out") });
    } finally {
      process.stdout.write = original;
    }
    expect(written.join("")).toBe("");
  });
});
