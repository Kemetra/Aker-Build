import { describe, it, expect } from "vitest";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

describe("013 config path scope in scanner", () => {
  it("excludes files from scanner discovery", () => {
    const root = fixture("saas");
    const configPath = join(root, "tenantguard.config.json");
    writeFileSync(
      configPath,
      JSON.stringify({ version: 1, paths: { exclude: ["apps/api/**"] } }),
      "utf8",
    );

    const { map } = scan(root, { configPath });
    expect(map.repos.map((repo) => repo.path)).not.toContain("apps/api");
    expect(map.repos.map((repo) => repo.path)).toContain("apps/web");
    expect(map.tenant_model.status).toBe("not_detected");
  });
});
