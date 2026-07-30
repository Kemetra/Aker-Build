import { describe, it, expect } from "vitest";
import { denyBlock } from "../src/deny-block.js";

describe("denyBlock", () => {
  it("renders forbidden paths as Claude Code deny rules", () => {
    expect(denyBlock(["migrations/**", "infra/secrets.ts"])).toEqual({
      permissions: {
        deny: [
          "Read(./migrations/**)",
          "Edit(./migrations/**)",
          "Read(./infra/secrets.ts)",
          "Edit(./infra/secrets.ts)",
        ],
      },
    });
  });

  it("returns an empty deny list rather than a wildcard when nothing is forbidden", () => {
    // A wildcard here would deny everything — failing closed in the harmful direction.
    expect(denyBlock([])).toEqual({ permissions: { deny: [] } });
  });

  it("does not double-prefix paths that already start with ./", () => {
    expect(denyBlock(["./secrets.ts"])).toEqual({
      permissions: { deny: ["Read(./secrets.ts)", "Edit(./secrets.ts)"] },
    });
  });

  it("deduplicates repeated paths so the emitted block is stable", () => {
    expect(denyBlock(["a.ts", "a.ts"])).toEqual({
      permissions: { deny: ["Read(./a.ts)", "Edit(./a.ts)"] },
    });
  });

  it("ignores blank entries rather than emitting a rule that matches the repo root", () => {
    // `Read(./)` would deny the entire tree — the opposite of a scoped boundary.
    expect(denyBlock(["", "   ", "real.ts"])).toEqual({
      permissions: { deny: ["Read(./real.ts)", "Edit(./real.ts)"] },
    });
  });
});
