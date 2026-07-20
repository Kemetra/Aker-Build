import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const workflowDirectory = join(repoRoot, ".github", "workflows");
const workflowPath = join(workflowDirectory, "aker-build-review.yml");
const guidePath = join(repoRoot, "docs", "ci", "github-actions.md");
const tempRoots: string[] = [];
const CHECKOUT_SHA = "de0fac2e4500dabe0009e67214ff5f5447ce83dd";
const SETUP_NODE_SHA = "48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e";

interface WorkflowStep {
  name?: string;
  uses?: string;
  if?: string;
  with?: Record<string, unknown>;
  env?: Record<string, unknown>;
  run?: string;
}

interface WorkflowDocument {
  on: Record<string, { inputs?: Record<string, unknown>; secrets?: Record<string, unknown> }>;
  permissions: Record<string, string>;
  jobs: Record<string, {
    "runs-on"?: string;
    uses?: string;
    permissions?: Record<string, string>;
    with?: Record<string, unknown>;
    steps?: WorkflowStep[];
  }>;
}

afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function loadWorkflow(): { document: WorkflowDocument; source: string } {
  const source = readFileSync(workflowPath, "utf8");
  return { document: parse(source) as WorkflowDocument, source };
}

function workflowSteps(): WorkflowStep[] {
  return loadWorkflow().document.jobs.review?.steps ?? [];
}

function documentedCaller(): WorkflowDocument {
  const guide = readFileSync(guidePath, "utf8");
  const match = guide.match(
    /<!-- consumer-workflow:start -->\s*```yaml\r?\n([\s\S]*?)```\s*<!-- consumer-workflow:end -->/,
  );
  expect(match, "canonical consumer workflow block").not.toBeNull();
  return parse(match?.[1] ?? "") as WorkflowDocument;
}

function enforcementCode(): string {
  const step = workflowSteps().find((candidate) => candidate.name === "Enforce critical findings");
  expect(step?.if).toBe("${{ inputs.fail-on-critical }}");
  const match = step?.run?.match(/^node -e "([\s\S]+)"$/);
  expect(match, "single dependency-free node predicate").not.toBeNull();
  return match?.[1] ?? "";
}

function runEnforcement(findings: Array<Record<string, string>>) {
  const root = mkdtempSync(join(tmpdir(), "aker-build-ci-predicate-"));
  tempRoots.push(root);
  mkdirSync(join(root, ".aker-build"));
  writeFileSync(join(root, ".aker-build", "review.json"), JSON.stringify({ findings }), "utf8");
  return spawnSync(process.execPath, ["-e", enforcementCode()], {
    cwd: root,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
  });
}

describe("reusable GitHub CI workflow", () => {
  it("pins every repository action and disables checkout credential persistence", () => {
    const workflowFiles = readdirSync(workflowDirectory)
      .filter((name) => /\.ya?ml$/.test(name))
      .sort();
    const references: string[] = [];

    expect(workflowFiles).toEqual([
      "aker-build-review.yml",
      "aker-build.yml",
      "npm-release.yml",
    ]);

    for (const filename of workflowFiles) {
      const source = readFileSync(join(workflowDirectory, filename), "utf8");
      const document = parse(source) as WorkflowDocument;
      for (const job of Object.values(document.jobs)) {
        for (const step of job.steps ?? []) {
          if (!step.uses) continue;
          references.push(step.uses);
          expect(step.uses, `${filename}: immutable action reference`).toMatch(
            /^[a-z0-9_.-]+\/[a-z0-9_.-]+@[0-9a-f]{40}$/,
          );
          expect(
            [
              `actions/checkout@${CHECKOUT_SHA}`,
              `actions/setup-node@${SETUP_NODE_SHA}`,
            ],
            `${filename}: approved action allowlist`,
          ).toContain(step.uses);

          if (step.uses.startsWith("actions/checkout@")) {
            expect(step.with?.["persist-credentials"], `${filename}: checkout safety`).toBe(false);
          }
        }
      }

      for (const line of source.split(/\r?\n/)) {
        if (line.includes(`actions/checkout@${CHECKOUT_SHA}`)) expect(line).toContain("# v6.0.2");
        if (line.includes(`actions/setup-node@${SETUP_NODE_SHA}`)) expect(line).toContain("# v6.4.0");
      }
    }

    expect(references).toHaveLength(14);
    expect(references.filter((reference) => reference === `actions/checkout@${CHECKOUT_SHA}`)).toHaveLength(7);
    expect(references.filter((reference) => reference === `actions/setup-node@${SETUP_NODE_SHA}`)).toHaveLength(7);
  });

  it("is callable-only with one report-only input and read-only permissions", () => {
    const { document, source } = loadWorkflow();

    expect(Object.keys(document.on)).toEqual(["workflow_call"]);
    const call = document.on.workflow_call;
    if (!call) throw new Error("workflow_call trigger is missing");
    expect(call.secrets).toBeUndefined();
    expect(call.inputs).toEqual({
      "fail-on-critical": {
        description: expect.any(String),
        required: false,
        type: "boolean",
        default: false,
      },
    });
    expect(document.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(JSON.stringify(document.permissions)).not.toContain("write");
    expect(source).not.toContain("${{ secrets.");
  });

  it("checks out the caller PR safely and uses the exact supported runtime", () => {
    const { document } = loadWorkflow();
    const job = document.jobs.review;
    if (!job) throw new Error("review job is missing");
    const checkout = job.steps?.find((step) => step.uses?.startsWith("actions/checkout@"));
    const setup = job.steps?.find((step) => step.uses?.startsWith("actions/setup-node@"));

    expect(Object.keys(document.jobs)).toEqual(["review"]);
    expect(job["runs-on"]).toBe("ubuntu-latest");
    expect(job.permissions).toBeUndefined();
    expect(checkout).toMatchObject({
      uses: `actions/checkout@${CHECKOUT_SHA}`,
      with: {
        ref: "${{ github.event.pull_request.head.sha }}",
        "persist-credentials": false,
      },
    });
    expect(setup).toMatchObject({
      uses: `actions/setup-node@${SETUP_NODE_SHA}`,
      with: { "node-version": "22.14", "package-manager-cache": false },
    });
  });

  it("runs the pinned package through the exact PR-number command chain", () => {
    const steps = workflowSteps();
    const runnable = steps.filter((step) => step.run).map((step) => step.run).join("\n");
    const invocations = runnable.match(/npx --yes aker-build@0\.1\.0/g) ?? [];
    const doctor = steps.find((step) => step.name === "Verify Aker Build readiness");
    const review = steps.find((step) => step.name === "Review caller PR");

    expect(invocations).toHaveLength(3);
    expect(doctor?.run).toBe("npx --yes aker-build@0.1.0 doctor . --github --format json");
    expect(doctor?.env).toEqual({ GH_TOKEN: "${{ github.token }}" });
    expect(review?.run).toContain("npx --yes aker-build@0.1.0 scan . --out .aker-build");
    expect(review?.run).toContain(
      'npx --yes aker-build@0.1.0 review-pr "$PR_NUMBER" --out .aker-build',
    );
    expect(review?.env).toEqual({
      GH_TOKEN: "${{ github.token }}",
      PR_NUMBER: "${{ github.event.pull_request.number }}",
    });
    expect(runnable.indexOf("doctor . --github")).toBeLessThan(runnable.indexOf("scan ."));
    expect(runnable.indexOf("scan .")).toBeLessThan(runnable.indexOf("review-pr"));
    expect(runnable).not.toContain("--local-diff");
  });

  it("always publishes a useful summary and contains no mutating or consumer-execution step", () => {
    const { document, source } = loadWorkflow();
    const summary = workflowSteps().find((step) => step.name === "Publish review summary");
    const normalized = source.toLowerCase();

    expect(summary?.if).toBe("always()");
    expect(summary?.run).toContain(".aker-build/review.md");
    expect(summary?.run).toContain("$GITHUB_STEP_SUMMARY");
    expect(summary?.run).toContain("did not produce a review");
    expect(normalized).not.toMatch(/\b(?:npm|pnpm|yarn|bun)\s+(?:install|ci|run|test|build)\b/);
    expect(normalized).not.toMatch(/\b(?:git\s+(?:commit|push|merge)|comment|label|upload-artifact)\b/);
    expect(normalized).not.toContain("packages/cli/src");
    expect(JSON.stringify(document)).not.toContain('"write"');
  });

  it("documents a minimal pinned caller with matching permissions", () => {
    const caller = documentedCaller();
    const job = caller.jobs.review;
    if (!job) throw new Error("documented review job is missing");

    expect(Object.keys(caller.on)).toEqual(["pull_request"]);
    expect(caller.permissions).toEqual({ contents: "read", "pull-requests": "read" });
    expect(Object.keys(caller.jobs)).toEqual(["review"]);
    expect(job.uses).toBe("Kemetra/Aker-Build/.github/workflows/aker-build-review.yml@v0.1.0");
    expect(job.with).toEqual({ "fail-on-critical": false });
    expect(job.steps).toBeUndefined();
    expect(job["runs-on"]).toBeUndefined();
  });

  it.each([
    ["empty", [], 0, "critical findings: 0"],
    ["non-critical", [{ severity: "high", evidence: "sentinel-high-evidence" }], 0, "critical findings: 0"],
    ["critical", [{ severity: "critical", evidence: "sentinel-critical-evidence" }], 1, "critical findings: 1"],
  ] as const)("enforces only critical findings for the %s fixture", (_name, findings, status, output) => {
    const result = runEnforcement([...findings]);

    expect(result.status).toBe(status);
    expect(result.stdout.trim()).toBe(output);
    expect(result.stderr).toBe("");
    expect(`${result.stdout}${result.stderr}`).not.toContain("sentinel-");
  });
});
