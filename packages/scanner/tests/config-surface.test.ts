import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectConfigSurface } from "../src/detect/config-surface.js";

function fixture(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-p1-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(join(abs, ".."), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

describe("detectConfigSurface", () => {
  it("emits env_var_use without capturing the value", () => {
    const root = fixture({ "cfg.ts": `const k = process.env.STRIPE_KEY;\n` });
    const ev = detectConfigSurface(root, ["cfg.ts"]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({ signal: "env_var_use", confidence: "medium", line: 1 });
    // value/name is never copied into the evidence
    expect(JSON.stringify(ev)).not.toContain("STRIPE_KEY");
  });

  it("emits billing_hook for a billing/usage call", () => {
    const root = fixture({ "pay.ts": `stripe.subscriptions.create(opts);\n` });
    const ev = detectConfigSurface(root, ["pay.ts"]);
    expect(ev.map((e) => e.signal)).toContain("billing_hook");
  });

  it("emits log_emit for a logger call", () => {
    const root = fixture({ "svc.ts": `logger.info("started");\n` });
    const ev = detectConfigSurface(root, ["svc.ts"]);
    expect(ev.map((e) => e.signal)).toContain("log_emit");
  });

  it("returns empty when nothing matches (honesty)", () => {
    const root = fixture({ "util.ts": `export const add = (a, b) => a + b;\n` });
    expect(detectConfigSurface(root, ["util.ts"])).toEqual([]);
  });
});
