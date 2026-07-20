import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildProgram,
  diagnoseRepository,
  renderDoctorResult,
  runDoctor,
  type DoctorDeps,
} from "../src/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-doctor-test-"));
  roots.push(root);
  return root;
}

interface Scenario {
  nodeVersion?: string;
  git?: boolean;
  repository?: boolean;
  ignored?: boolean;
  gh?: boolean;
  token?: boolean;
}

type ScenarioState = Required<Scenario>;
type ProbeResult = { ok: boolean; stdout: string };

function failedProbe(): ProbeResult {
  return { ok: false, stdout: "" };
}

function repositoryProbe(state: ScenarioState): ProbeResult {
  if (!state.git) return failedProbe();
  if (!state.repository) return failedProbe();
  return { ok: true, stdout: "true" };
}

function outputIgnoreProbe(state: ScenarioState): ProbeResult {
  if (!state.git) return failedProbe();
  if (!state.repository) return failedProbe();
  return { ok: state.ignored, stdout: "" };
}

function gitProbe(state: ScenarioState, operation: string | undefined): ProbeResult {
  if (operation === "--version") return { ok: state.git, stdout: "git version test" };
  if (operation === "rev-parse") return repositoryProbe(state);
  if (operation === "check-ignore") return outputIgnoreProbe(state);
  return failedProbe();
}

function scenarioProbe(state: ScenarioState, command: string, args: readonly string[]): ProbeResult {
  if (command === "git") return gitProbe(state, args[0]);
  if (command === "gh") return { ok: state.gh, stdout: "gh version test" };
  return failedProbe();
}

function scenarioDeps(scenario: Scenario = {}): DoctorDeps {
  const state: ScenarioState = {
    nodeVersion: "v22.14.0",
    git: true,
    repository: true,
    ignored: true,
    gh: true,
    token: true,
    ...scenario,
  };
  return {
    nodeVersion: state.nodeVersion,
    probe: (command, args) => scenarioProbe(state, command, args),
    hasEnvironmentVariable: () => state.token,
  };
}

describe("doctor diagnostics", () => {
  it.each([
    ["v22.13.0", "pass"],
    ["22.14.0", "pass"],
    ["v23.0.0", "pass"],
    ["v22.12.9", "fail"],
    ["invalid", "fail"],
  ] as const)("classifies Node %s as %s", (nodeVersion, expected) => {
    const result = diagnoseRepository(makeRoot(), {}, scenarioDeps({ nodeVersion }));
    expect(result.checks[0]).toMatchObject({ id: "node", status: expected });
  });

  it("returns ordered passing local checks for a ready configured repo", () => {
    const root = makeRoot();
    writeFileSync(join(root, "aker-build.config.yaml"), "version: 1\n", "utf8");

    const result = diagnoseRepository(root, {}, scenarioDeps());

    expect(result).toMatchObject({ version: 1, repository: root, mode: "local", status: "ready" });
    expect(result.checks.map((check) => check.id)).toEqual([
      "node",
      "git",
      "repository",
      "config",
      "output-ignore",
    ]);
    expect(result.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("keeps missing config and unignored output as warning-only readiness", () => {
    const result = diagnoseRepository(makeRoot(), {}, scenarioDeps({ ignored: false }));

    expect(result.status).toBe("ready");
    expect(result.checks.find((check) => check.id === "config")).toMatchObject({ status: "warn" });
    expect(result.checks.find((check) => check.id === "output-ignore")).toMatchObject({
      status: "warn",
      remediation: expect.stringContaining(".gitignore"),
    });
  });

  it("fails readiness for a non-Git target without cascading output-ignore failure", () => {
    const result = diagnoseRepository(makeRoot(), {}, scenarioDeps({ repository: false }));

    expect(result.status).toBe("needs_attention");
    expect(result.checks.find((check) => check.id === "repository")?.status).toBe("fail");
    expect(result.checks.find((check) => check.id === "output-ignore")?.status).toBe("warn");
  });

  it("fails safely for invalid or conflicting config without exposing contents", () => {
    const invalidRoot = makeRoot();
    writeFileSync(
      join(invalidRoot, "aker-build.config.json"),
      '{"version":2,"token":"sentinel-doctor-secret"}\n',
      "utf8",
    );
    const invalid = diagnoseRepository(invalidRoot, {}, scenarioDeps());

    expect(invalid.status).toBe("needs_attention");
    expect(JSON.stringify(invalid)).not.toContain("sentinel-doctor-secret");
    expect(invalid.checks.find((check) => check.id === "config")?.status).toBe("fail");

    const conflictRoot = makeRoot();
    writeFileSync(join(conflictRoot, "aker-build.config.json"), '{"version":1}\n', "utf8");
    writeFileSync(join(conflictRoot, "aker-build.config.yaml"), "version: 1\n", "utf8");
    const conflict = diagnoseRepository(conflictRoot, {}, scenarioDeps());
    expect(conflict.checks.find((check) => check.id === "config")).toMatchObject({ status: "fail" });
  });

  it("appends GitHub checks only in GitHub mode", () => {
    const root = makeRoot();
    const local = diagnoseRepository(root, {}, scenarioDeps());
    const github = diagnoseRepository(root, { github: true }, scenarioDeps());

    expect(local.checks.map((check) => check.id)).not.toContain("gh");
    expect(github.mode).toBe("github");
    expect(github.checks.map((check) => check.id).slice(-2)).toEqual(["gh", "github-token"]);
    expect(github.status).toBe("ready");
  });

  it("fails missing GitHub prerequisites without retaining credential values", () => {
    const sentinel = "sentinel-token-never-returned";
    const deps = scenarioDeps({ gh: false, token: false });
    deps.hasEnvironmentVariable = (name) => {
      void sentinel;
      return name === "GH_TOKEN" ? false : false;
    };

    const result = diagnoseRepository(makeRoot(), { github: true }, deps);
    const rendered = `${renderDoctorResult(result, "text")}\n${renderDoctorResult(result, "json")}`;

    expect(result.status).toBe("needs_attention");
    expect(result.checks.slice(-2).map((check) => check.status)).toEqual(["fail", "fail"]);
    expect(rendered).not.toContain(sentinel);
  });

  it("renders text and JSON from the same result model", () => {
    const result = diagnoseRepository(makeRoot(), {}, scenarioDeps({ ignored: false }));
    const text = renderDoctorResult(result, "text");
    const json = renderDoctorResult(result, "json");

    expect(JSON.parse(json)).toEqual(result);
    for (const check of result.checks) expect(text).toContain(check.id);
    expect(text).toContain("READY");
  });

  it("maps ready, needs-attention, and invalid-format command exits", () => {
    const root = makeRoot();
    const output: string[] = [];
    const errors: string[] = [];

    expect(runDoctor(root, { format: "json", sink: (text) => output.push(text), errSink: (line) => errors.push(line) }, scenarioDeps())).toBe(0);
    expect(JSON.parse(output.join(""))).toMatchObject({ status: "ready" });
    expect(runDoctor(root, { sink: () => {}, errSink: () => {} }, scenarioDeps({ git: false }))).toBe(1);
    expect(runDoctor(root, { format: "yaml" as "text", sink: () => {}, errSink: (line) => errors.push(line) }, scenarioDeps())).toBe(2);
    expect(errors.at(-1)).toMatch(/text or json/);
  });

  it("performs zero filesystem writes", () => {
    const root = makeRoot();
    writeFileSync(join(root, "source.txt"), "unchanged\n", "utf8");
    const before = readdirSync(root).sort();

    diagnoseRepository(root, { github: true }, scenarioDeps());
    runDoctor(root, { format: "text", sink: () => {}, errSink: () => {} }, scenarioDeps());

    expect(readdirSync(root).sort()).toEqual(before);
  });

  it("registers both onboarding commands in CLI help", () => {
    const names = buildProgram().commands.map((command) => command.name());
    expect(names).toContain("init");
    expect(names).toContain("doctor");
  });
});
