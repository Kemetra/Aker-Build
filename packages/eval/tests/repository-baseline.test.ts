import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(here, "../../..");

function pathFromRoot(path: string): string {
  return resolve(REPO_ROOT, path);
}

function read(path: string): string {
  const absolute = pathFromRoot(path);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : "";
}

function expectFile(path: string): string {
  const contents = read(path);
  expect(contents, `${path} must exist and be non-empty`).not.toBe("");
  return contents;
}

function workflowFiles(): string[] {
  const directory = pathFromRoot(".github/workflows");
  if (!existsSync(directory)) return [];
  return readdirSync(directory)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => `.github/workflows/${name}`);
}

describe("repository CI and supply-chain baseline", () => {
  it("pins every GitHub Action to a full SHA with a release comment", () => {
    const lines = workflowFiles().flatMap((path) =>
      read(path)
        .split(/\r?\n/u)
        .filter((line) => /\buses:/u.test(line))
        .map((line) => `${path}: ${line.trim()}`),
    );

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/uses:\s*[^\s@]+@[0-9a-f]{40}\s+#\s+v\d+(?:\.\d+){1,2}\s*$/u);
    }
  });

  it("runs the complete baseline across supported Node versions and platforms", () => {
    const workflow = expectFile(".github/workflows/aker-build.yml");

    for (const value of ["ubuntu-latest", "windows-latest", "macos-latest", "22.13.0", "24"]) {
      expect(workflow).toContain(value);
    }
    for (const command of ["pnpm test", "pnpm typecheck", "smoke-first-run.ps1", "packages/eval/src/bin.ts"]) {
      expect(workflow).toContain(command);
    }
    expect(workflow).toContain("GIT_CONFIG_GLOBAL");
    expect(workflow).toContain("Quality (${{ matrix.name }})");
  });

  it("defines audit, CodeQL, dependency-update, ownership, and disclosure policy", () => {
    const security = expectFile(".github/workflows/security.yml");
    for (const value of [
      "pnpm audit --prod",
      "javascript-typescript",
      "security-events: write",
      "schedule:",
      "workflow_dispatch:",
    ]) expect(security).toContain(value);
    expect(security).not.toContain("continue-on-error");

    const dependabot = expectFile(".github/dependabot.yml");
    expect(dependabot).toContain('package-ecosystem: "npm"');
    expect(dependabot).toContain('package-ecosystem: "github-actions"');

    for (const path of [".github/CODEOWNERS", "SECURITY.md", "docs/operations/repository-protection.md"]) {
      expectFile(path);
    }
  });
});

describe("GitHub App source truth", () => {
  const permissionPaths = [
    "packages/github-app/README.md",
    "packages/github-app-server/README.md",
    "specs/014-github-app-report-only/quickstart.md",
    "specs/015-github-app-deployment/quickstart.md",
    "specs/015-github-app-deployment/live-smoke-checklist.md",
  ];
  const runtimePaths = [
    "packages/github-app-server/README.md",
    "specs/015-github-app-deployment/quickstart.md",
    "specs/015-github-app-deployment/live-smoke-checklist.md",
  ];

  it("documents the complete minimum permission set everywhere it is prescribed", () => {
    for (const path of permissionPaths) {
      const doc = expectFile(path);
      for (const permission of ["metadata: read", "contents: read", "pull_requests: read", "checks: write"]) {
        expect(doc, `${path} must document ${permission}`).toContain(permission);
      }
    }
  });

  it("documents every required runtime variable in operator-facing instructions", () => {
    for (const path of runtimePaths) {
      const doc = expectFile(path);
      for (const name of [
        "AKER_BUILD_APP_ID",
        "AKER_BUILD_APP_PRIVATE_KEY",
        "AKER_BUILD_WEBHOOK_SECRET",
        "AKER_BUILD_INSTALLATION_ID",
      ]) expect(doc, `${path} must document ${name}`).toContain(name);
    }
  });

  it("contains no legacy smoke prefix or stale unwired/deferred App claim", () => {
    const appDocs = permissionPaths.map(read).join("\n");
    expect(appDocs).not.toContain("TG_SMOKE_");
    expect(appDocs).not.toContain("A production entrypoint that binds an HTTP listener");
    expect(read("README.md")).not.toContain("GitHub App, hosted dashboard");
    expect(read("packages/cli/README.md")).toContain("report-only GitHub App");
  });

  it("links implemented 014 and 015 status to evidence ledgers", () => {
    for (const feature of ["014-github-app-report-only", "015-github-app-deployment"]) {
      expect(read(`specs/${feature}/spec.md`)).toMatch(/\*\*Status\*\*:\s*Implemented/u);
      expect(read(`specs/${feature}/plan.md`)).toMatch(/Status:\s*Implemented/u);
      expect(read(`specs/${feature}/tasks.md`)).toContain(
        feature.startsWith("014") ? "implementation-evidence.md" : "acceptance-evidence.md",
      );
    }
  });
});
