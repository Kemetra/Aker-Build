import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(packageRoot, "../..");
const read = (path: string) => readFileSync(resolve(repoRoot, path), "utf8");

describe("compiled App-server artifact contract", () => {
  it("builds separate server and worker Node 24 bundles with an exact direct esbuild dependency", () => {
    const manifest = JSON.parse(read("packages/github-app-server/package.json")) as {
      scripts?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    expect(manifest.scripts?.build).toBe("node scripts/build.mjs");
    expect(manifest.devDependencies?.esbuild).toMatch(/^\d+\.\d+\.\d+$/u);
    const script = read("packages/github-app-server/scripts/build.mjs");
    expect(script).toContain('server: "src/bin.ts"');
    expect(script).toContain('"worker-entry": "src/worker-entry.ts"');
    expect(script).toContain('target: "node24"');
  });

  it("defines a pinned, non-root, health-checked image with a dedicated temp volume", () => {
    const dockerfile = read("packages/github-app-server/Dockerfile");
    expect(dockerfile.match(/^FROM node:24-alpine@sha256:[0-9a-f]{64}/gmu)).toHaveLength(2);
    for (const value of ["USER node", "HEALTHCHECK", "VOLUME", "AKER_BUILD_TMP_ROOT", "dist/server.mjs"]) {
      expect(dockerfile).toContain(value);
    }
    expect(dockerfile).not.toMatch(/AKER_BUILD_(?:APP_PRIVATE_KEY|WEBHOOK_SECRET)\s*=/u);
  });

  it("documents read-only/container isolation and CI builds without publishing", () => {
    const compose = read("deploy/github-app.compose.yml");
    expect(compose).toContain("read_only: true");
    expect(compose).toContain("cap_drop:");
    expect(compose).toContain("no-new-privileges:true");
    expect(compose).toContain("aker-build-tmp");
    // Review snapshot/analysis work writes under the OS tmpdir (/tmp), not AKER_BUILD_TMP_ROOT;
    // the read-only rootfs needs its own writable mount there or every review worker fails.
    expect(compose).toMatch(/type:\s*tmpfs/u);
    expect(compose).toMatch(/target:\s*\/tmp/u);
    const workflow = read(".github/workflows/aker-build.yml");
    expect(workflow).toContain("Container build");
    expect(workflow).toContain("docker build");
    expect(workflow).not.toContain("docker push");
    expect(existsSync(resolve(repoRoot, ".dockerignore"))).toBe(true);
  });
});
