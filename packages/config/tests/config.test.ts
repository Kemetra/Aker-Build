import { describe, it, expect } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  ConfigNotFoundError,
  ConfigSecretError,
  filterPaths,
  findConfigPath,
  isPathAllowed,
  loadConfig,
  validateConfig,
} from "../src/index.js";

function tempRepo(): string {
  return mkdtempSync(join(tmpdir(), "tg-config-"));
}

describe("tenantguard config schema and reader", () => {
  it("accepts valid JSON config with auditable suppressions", () => {
    const result = validateConfig({
      version: 1,
      project: { name: "example-saas", type: "monorepo" },
      paths: { include: ["apps/**"], exclude: ["dist/**"] },
      gates: {
        "TG-G4": {
          severity: "high",
          suppressions: [
            {
              id: "TG-G4-DEMO-001",
              path: "apps/demo/**",
              reason: "Demo fixture intentionally has an unguarded route.",
              owner: "maintainer",
              expires: "2026-09-01",
            },
          ],
        },
      },
      specs: { adapter: "auto" },
    });

    expect(result.ok).toBe(true);
    expect(result.config?.gates?.["TG-G4"]?.suppressions?.[0]?.owner).toBe("maintainer");
  });

  it("loads tenantguard.config.yaml when present", () => {
    const repo = tempRepo();
    writeFileSync(
      join(repo, "tenantguard.config.yaml"),
      [
        "version: 1",
        "project:",
        "  name: yaml-saas",
        "gates:",
        "  TG-G4:",
        "    suppressions:",
        "      - id: TG-G4-YAML-001",
        "        path: apps/api/**",
        "        reason: Fixture-level suppression for a known demo route.",
        "        owner: maintainer",
      ].join("\n"),
      "utf8",
    );

    const loaded = loadConfig(repo);
    expect(loaded.path).toMatch(/tenantguard\.config\.yaml$/);
    expect(loaded.config.project?.name).toBe("yaml-saas");
  });

  it("rejects suppressions without reason, owner, and path or finding_id", () => {
    const result = validateConfig({
      version: 1,
      gates: {
        "TG-G4": {
          suppressions: [{ id: "TG-G4-BAD-001", path: "apps/**" }],
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/reason|owner/);

    const missingTarget = validateConfig({
      version: 1,
      gates: {
        "TG-G4": {
          suppressions: [{ id: "TG-G4-BAD-002", reason: "too broad", owner: "maintainer" }],
        },
      },
    });
    expect(missingTarget.ok).toBe(false);
    expect(missingTarget.errors.join("\n")).toMatch(/path or finding_id/);
  });

  it("rejects unknown config keys instead of silently stripping them", () => {
    const result = validateConfig({
      version: 1,
      unknown: true,
      project: { name: "example-saas", extra: "not allowed" },
      gates: {
        "TG-G4": {
          extra: "not allowed",
        },
      },
    });

    expect(result.ok).toBe(false);
    expect(result.errors.join("\n")).toMatch(/Unrecognized key/);
  });

  it("rejects secret-like config content without leaking the value", () => {
    const repo = tempRepo();
    writeFileSync(
      join(repo, "tenantguard.config.json"),
      JSON.stringify({ version: 1, token: "0123456789abcdef0123456789abcdef" }),
      "utf8",
    );

    expect(() => loadConfig(repo)).toThrow(ConfigSecretError);
    try {
      loadConfig(repo);
    } catch (err) {
      expect(String(err)).toContain("secret-like content");
      expect(String(err)).not.toContain("0123456789abcdef");
    }
  });

  it("returns null when no config is present", () => {
    expect(findConfigPath(tempRepo())).toBeNull();
  });

  it("throws when an explicit config path is missing", () => {
    expect(() => loadConfig(tempRepo(), { configPath: "missing.config.json" })).toThrow(ConfigNotFoundError);
  });

  it("matches include and exclude path filters consistently", () => {
    const config = {
      version: 1 as const,
      paths: {
        include: ["apps/**/*.ts", "package.json"],
        exclude: ["apps/api/generated/**", "apps/web/secret.ts"],
      },
    };

    expect(isPathAllowed("apps/api/routes/admin.ts", config)).toBe(true);
    expect(isPathAllowed("apps/admin.ts", config)).toBe(true);
    expect(isPathAllowed("apps/api/generated/client.ts", config)).toBe(false);
    expect(isPathAllowed("apps/web/secret.ts", config)).toBe(false);
    expect(isPathAllowed("docs/readme.md", config)).toBe(false);
    expect(isPathAllowed("package.json", config)).toBe(true);
    expect(filterPaths(["docs/readme.md", "apps/api/routes/admin.ts", "package.json"], config)).toEqual([
      "apps/api/routes/admin.ts",
      "package.json",
    ]);
  });
});
