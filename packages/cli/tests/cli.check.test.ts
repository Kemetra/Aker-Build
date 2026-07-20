import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CHECK_ARTIFACTS, runCheck, type CheckDeps } from "../src/commands/check.js";
import { CLI_VERSION } from "../src/version.js";

const roots: string[] = [];

afterEach(() => {
  for (const path of roots.splice(0)) rmSync(path, { recursive: true, force: true });
});

function makeRoot(): string {
  const value = mkdtempSync(join(tmpdir(), "aker-build-check-test-"));
  roots.push(value);
  return value;
}

interface StageCall {
  name: string;
  target: string;
  out: string;
  config?: string;
}

interface FakeDepsOptions {
  failAt?: string;
  exitCode?: number;
  omit?: string;
}

function fakeDeps(calls: StageCall[], options: FakeDepsOptions = {}): CheckDeps {
  const stage = (name: string, files: readonly string[]) =>
    (target: string, opts: { out?: string; config?: string; errSink?: (line: string) => void }): number => {
      const out = opts.out ?? "";
      calls.push({ name, target, out, config: opts.config });
      mkdirSync(out, { recursive: true });
      for (const file of files) {
        if (file !== options.omit) writeFileSync(join(out, file), JSON.stringify({ stage: name }));
      }
      if (options.failAt === name) {
        opts.errSink?.(`${name} diagnostic`);
        return options.exitCode ?? 3;
      }
      return 0;
    };

  return {
    scan: stage("scan", ["project-map.json"]),
    gates: stage("gates", ["risks.json"]),
    queue: stage("queue", ["queue.json"]),
    route: stage("route", ["route.json"]),
    report: stage("report", ["aker-build-report.json", "aker-build-report.md"]),
  } as CheckDeps;
}

function writePreviousArtifacts(out: string): void {
  mkdirSync(out, { recursive: true });
  for (const file of CHECK_ARTIFACTS) writeFileSync(join(out, file), `previous:${file}`);
}

describe("runCheck", () => {
  it("runs every stage in order with resolved shared paths and promotes a complete set", () => {
    const work = makeRoot();
    const relativeTarget = ".";
    const relativeOut = join(work, "out");
    const relativeConfig = join(work, "aker-build.config.json");
    const calls: StageCall[] = [];
    const output: string[] = [];

    expect(runCheck(relativeTarget, {
      out: relativeOut,
      config: relativeConfig,
      sink: (line) => output.push(line),
      errSink: () => {},
    }, fakeDeps(calls))).toBe(0);

    expect(calls.map((call) => call.name)).toEqual(["scan", "gates", "queue", "route", "report"]);
    expect(new Set(calls.map((call) => call.target))).toEqual(new Set([resolve(relativeTarget)]));
    expect(new Set(calls.map((call) => call.out)).size).toBe(1);
    expect(calls[0]?.config).toBe(resolve(relativeConfig));
    expect(calls[1]?.config).toBe(resolve(relativeConfig));
    expect(calls.slice(2).every((call) => call.config === undefined)).toBe(true);
    for (const file of CHECK_ARTIFACTS) expect(existsSync(join(relativeOut, file))).toBe(true);
    expect(existsSync(calls[0]?.out ?? "")).toBe(false);
    expect(output.at(-1)).toContain(resolve(relativeOut));
  });

  it.each([1, 2, 3, 9])("short-circuits and maps stage exit code %i", (exitCode) => {
    const work = makeRoot();
    const out = join(work, "out");
    writePreviousArtifacts(out);
    writeFileSync(join(out, "unrelated.txt"), "keep");
    const calls: StageCall[] = [];
    const errors: string[] = [];

    expect(runCheck(work, {
      out,
      sink: () => {},
      errSink: (line) => errors.push(line),
    }, fakeDeps(calls, { failAt: "gates", exitCode }))).toBe(exitCode >= 1 && exitCode <= 3 ? exitCode : 3);

    expect(calls.map((call) => call.name)).toEqual(["scan", "gates"]);
    for (const file of CHECK_ARTIFACTS) expect(readFileSync(join(out, file), "utf8")).toBe(`previous:${file}`);
    expect(readFileSync(join(out, "unrelated.txt"), "utf8")).toBe("keep");
    expect(existsSync(calls[0]?.out ?? "")).toBe(false);
    expect(errors.at(-1)).toContain("gates diagnostic");
  });

  it("validates the complete staged set before replacing prior artifacts", () => {
    const work = makeRoot();
    const out = join(work, "out");
    writePreviousArtifacts(out);
    const calls: StageCall[] = [];
    const errors: string[] = [];

    expect(runCheck(work, {
      out,
      sink: () => {},
      errSink: (line) => errors.push(line),
    }, fakeDeps(calls, { omit: "aker-build-report.md" }))).toBe(3);

    for (const file of CHECK_ARTIFACTS) expect(readFileSync(join(out, file), "utf8")).toBe(`previous:${file}`);
    expect(existsSync(calls[0]?.out ?? "")).toBe(false);
    expect(errors.at(-1)).toContain("check stage output missing: aker-build-report.md");
  });
});

describe("CLI version", () => {
  it("uses the first public package version", () => {
    expect(CLI_VERSION).toBe("0.1.0");
  });
});
