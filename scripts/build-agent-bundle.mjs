// Generate the Claude Code plugin bundle from the command-surface authority.
// The bundle is an output, never a hand-edited tree: that is what lets us answer
// "is this the bundle we reviewed?" by hash.

import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  manifestEntry,
  normalizeText,
  parseSurfaceYaml,
  reconcile,
  validateSurfaceEntry,
  validateWrapperText,
} from "./agent-bundle.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const templates = join(repo, "distribution", "bundle-templates", "claude");
const output = join(repo, "packages", "plugin", "dist");

const AUTHORITY = "distribution/agent-command-surface.yaml";
const WRAPPER_DIR = "distribution/bundle-templates/claude/commands";
const SKILL_SOURCE = "distribution/bundle-templates/claude/skills/aker-build/SKILL.md";
const PLUGIN_SOURCE = "distribution/bundle-templates/claude/.claude-plugin/plugin.json";

function readRepoFile(relative) {
  return readFileSync(join(repo, relative), "utf8");
}

function cliVersion() {
  const source = readRepoFile("packages/cli/src/version.ts");
  const match = /CLI_VERSION\s*=\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("could not read CLI_VERSION from packages/cli/src/version.ts");
  return match[1];
}

function writeBundleFile(destination, text) {
  const target = join(output, destination);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, text);
}

export function buildAgentBundle() {
  const surface = parseSurfaceYaml(readRepoFile(AUTHORITY));
  const problems = surface.commands.flatMap((entry) => validateSurfaceEntry(entry));

  const wrapperPaths = readdirSync(join(templates, "commands"))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `${WRAPPER_DIR}/${name}`);
  problems.push(...reconcile({ entries: surface.commands, wrapperPaths }));

  if (problems.length > 0) {
    throw new Error(`agent command surface is invalid:\n  ${problems.join("\n  ")}`);
  }

  rmSync(output, { recursive: true, force: true });
  const entries = [];

  // plugin.json — the only file needing substitution, so version has one source of truth.
  const pluginSource = readRepoFile(PLUGIN_SOURCE);
  const pluginText = normalizeText(pluginSource.replace("__VERSION__", cliVersion()));
  writeBundleFile(".claude-plugin/plugin.json", pluginText);
  entries.push(
    manifestEntry({
      source: PLUGIN_SOURCE,
      sourceText: pluginSource,
      destination: ".claude-plugin/plugin.json",
      outputText: pluginText,
      transform: "template-substitute-version-v1",
      classification: "generated_wrapper",
    }),
  );

  // The router skill.
  const skillSource = readRepoFile(SKILL_SOURCE);
  const skillText = normalizeText(skillSource);
  writeBundleFile("skills/aker-build/SKILL.md", skillText);
  entries.push(
    manifestEntry({
      source: SKILL_SOURCE,
      sourceText: skillSource,
      destination: "skills/aker-build/SKILL.md",
      outputText: skillText,
      transform: "copy-normalized-v1",
      classification: "router_skill",
    }),
  );

  // One wrapper per shipped command, in authority order for a stable manifest.
  for (const entry of surface.commands.filter((c) => c.status === "shipped")) {
    const wrapperSource = readRepoFile(entry.wrapper_template);
    const wrapperProblems = validateWrapperText(wrapperSource);
    if (wrapperProblems.length > 0) {
      throw new Error(`${entry.wrapper_template}: ${wrapperProblems.join("; ")}`);
    }
    const wrapperText = normalizeText(wrapperSource);
    writeBundleFile(entry.bundle_destination, wrapperText);
    entries.push(
      manifestEntry({
        source: entry.wrapper_template,
        sourceText: wrapperSource,
        destination: entry.bundle_destination,
        outputText: wrapperText,
        transform: "copy-normalized-v1",
        classification: "generated_wrapper",
      }),
    );
  }

  const manifest = { entries };
  writeFileSync(join(output, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  return { output, manifest };
}

// Run only when invoked directly, not when imported by the verifier. Comparing against
// pathToFileURL rather than concatenating "file://" onto process.argv[1] matters: argv[1]
// is the path as typed (often relative) and uses backslashes on Windows, so the naive
// string form silently never matches and the script exits having done nothing.
// argv[1] is undefined when Node evaluates inline source (`node -e`), so check it first.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { output: dir, manifest } = buildAgentBundle();
  process.stdout.write(`Wrote ${manifest.entries.length} files to ${dir}\n`);
}
