import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "@aker-build/config";
import { runInit } from "../src/index.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeRoot(git = true): string {
  const root = mkdtempSync(join(tmpdir(), "aker-build-init-test-"));
  roots.push(root);
  if (git) execFileSync("git", ["init", "--quiet"], { cwd: root, stdio: "ignore" });
  return root;
}

function visibleFiles(root: string): string[] {
  return readdirSync(root).filter((name) => name !== ".git").sort();
}

describe("runInit", () => {
  it("creates exactly one behavior-neutral YAML config by default", () => {
    const root = makeRoot();
    const output: string[] = [];

    expect(runInit(root, { sink: (text) => output.push(text), errSink: () => {} })).toBe(0);

    expect(visibleFiles(root)).toEqual(["aker-build.config.yaml"]);
    expect(loadConfig(root).config).toEqual({ version: 1 });
    expect(output.join("")).toContain("aker-build.config.yaml");
  });

  it("creates the JSON format when explicitly selected", () => {
    const root = makeRoot();

    expect(runInit(root, { format: "json", sink: () => {}, errSink: () => {} })).toBe(0);

    expect(visibleFiles(root)).toEqual(["aker-build.config.json"]);
    expect(loadConfig(root).config).toEqual({ version: 1 });
  });

  it("is a byte-preserving success when one valid config already exists", () => {
    const root = makeRoot();
    const path = join(root, "aker-build.config.yaml");
    writeFileSync(path, "version: 1\n", "utf8");
    const before = readFileSync(path, "utf8");

    expect(runInit(root, { sink: () => {}, errSink: () => {} })).toBe(0);

    expect(readFileSync(path, "utf8")).toBe(before);
    expect(visibleFiles(root)).toEqual(["aker-build.config.yaml"]);
  });

  it("refuses an invalid existing config without changing it", () => {
    const root = makeRoot();
    const path = join(root, "aker-build.config.json");
    const invalid = '{"version":2,"token":"sentinel-secret-value"}\n';
    writeFileSync(path, invalid, "utf8");
    const errors: string[] = [];

    expect(runInit(root, { sink: () => {}, errSink: (line) => errors.push(line) })).toBe(2);

    expect(readFileSync(path, "utf8")).toBe(invalid);
    expect(errors.join("\n")).not.toContain("sentinel-secret-value");
  });

  it("refuses two recognized config formats without changing either", () => {
    const root = makeRoot();
    writeFileSync(join(root, "aker-build.config.json"), '{"version":1}\n', "utf8");
    writeFileSync(join(root, "aker-build.config.yaml"), "version: 1\n", "utf8");
    const before = visibleFiles(root);

    expect(runInit(root, { sink: () => {}, errSink: () => {} })).toBe(2);

    expect(visibleFiles(root)).toEqual(before);
  });

  it.each(["yaml", "json"] as const)("previews valid %s with zero writes", (format) => {
    const root = makeRoot();
    const output: string[] = [];

    expect(runInit(root, { format, stdout: true, sink: (text) => output.push(text), errSink: () => {} })).toBe(0);

    expect(visibleFiles(root)).toEqual([]);
    if (format === "json") expect(JSON.parse(output.join(""))).toEqual({ version: 1 });
    else expect(output.join("")).toContain("version: 1");
  });

  it("requires an existing Git repository even in preview mode", () => {
    const root = makeRoot(false);

    expect(runInit(root, { stdout: true, sink: () => {}, errSink: () => {} })).toBe(1);
    expect(visibleFiles(root)).toEqual([]);
  });

  it("rejects an unsupported format before writing", () => {
    const root = makeRoot();

    expect(runInit(root, { format: "toml" as "yaml", sink: () => {}, errSink: () => {} })).toBe(2);
    expect(visibleFiles(root)).toEqual([]);
  });

  it("treats a concurrent valid exclusive-create winner as initialized", () => {
    const root = makeRoot();
    const path = join(root, "aker-build.config.yaml");

    expect(runInit(root, { sink: () => {}, errSink: () => {} }, {
      isGitRepository: () => true,
      writeExclusive: (_path, content) => {
        writeFileSync(path, content, { encoding: "utf8", flag: "wx" });
        throw Object.assign(new Error("exists"), { code: "EEXIST" });
      },
    })).toBe(0);

    expect(visibleFiles(root)).toEqual(["aker-build.config.yaml"]);
    expect(loadConfig(root).config).toEqual({ version: 1 });
  });

  it("rejects a missing target directory as invalid input", () => {
    const root = makeRoot();
    const missing = join(root, "missing");

    expect(runInit(missing, { sink: () => {}, errSink: () => {} })).toBe(2);
    expect(existsSync(missing)).toBe(false);
  });
});
