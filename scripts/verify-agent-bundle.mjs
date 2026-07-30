// Verify the generated agent bundle: reproducible hashes, agreement with the reviewed
// baseline, existing CLI verbs, and a read-only surface. Fails closed with named
// problems so a breakage is diagnosable.
//
// Deliberately dependency-free (Node built-ins plus sibling scripts only) so it runs on
// a fresh clone before any install step.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildAgentBundle } from "./build-agent-bundle.mjs";
import {
  checkCliVerbsExist,
  extractCliVerbs,
  normalizeText,
  parseSurfaceYaml,
  sha256,
  SHIPPED_MODES,
} from "./agent-bundle.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const MANIFEST_RELATIVE = "packages/plugin/dist/bundle-manifest.json";

/**
 * The reviewed baseline, read from Git rather than the working tree.
 *
 * The generator rewrites the manifest in place, so a run that detects drift would also
 * destroy the very baseline it compared against — the next run would then "pass" against
 * the drifted output and silently bless the change. Asking Git keeps the baseline
 * immutable. Returns null when it has never been committed, which is a first-run
 * condition rather than an error.
 */
function readCommittedBaseline(problems) {
  try {
    return execFileSync("git", ["show", `HEAD:${MANIFEST_RELATIVE}`], {
      cwd: repo,
      encoding: "utf8",
    });
  } catch {
    // Not committed yet (first run, or a shallow/absent Git context): fall back to disk.
    try {
      return readFileSync(join(repo, MANIFEST_RELATIVE), "utf8");
    } catch {
      problems.push(
        `${MANIFEST_RELATIVE} is missing — run \`pnpm build:agent-bundle\` and commit it as the reviewed baseline`,
      );
      return null;
    }
  }
}

/** Two consecutive runs must agree, or "verified by hash" means nothing. */
function checkReproducible(first, second) {
  return JSON.stringify(first.manifest) === JSON.stringify(second.manifest)
    ? []
    : ["generator is not reproducible: two runs produced different manifests"];
}

/** Determinism alone says nothing about whether this is the bundle a reviewer approved. */
function checkMatchesBaseline(manifest, committed) {
  if (committed === null) return [];
  const regenerated = `${JSON.stringify(manifest, null, 2)}\n`;
  return normalizeText(regenerated) === normalizeText(committed)
    ? []
    : [
        "regenerated manifest differs from the committed baseline — if a template changed on purpose, run `pnpm build:agent-bundle` and commit the new manifest",
      ];
}

/** Every recorded hash must match the bytes on disk, for both output and source. */
function checkHashes({ manifest, output }) {
  const problems = [];
  for (const entry of manifest.entries) {
    const onDisk = readFileSync(join(output, entry.destination), "utf8");
    if (sha256(normalizeText(onDisk)) !== entry.output_sha256) {
      problems.push(`${entry.destination}: output_sha256 does not match the file on disk`);
    }
    const source = readFileSync(join(repo, entry.source), "utf8");
    if (sha256(normalizeText(source)) !== entry.source_sha256) {
      problems.push(`${entry.source}: source_sha256 does not match the template on disk`);
    }
  }
  return problems;
}

/**
 * 018 ships a read-only surface. Asserting it here means a mutating entry cannot reach a
 * release on review alone.
 */
function checkReadOnlyModes(commands) {
  return commands
    .filter((entry) => !SHIPPED_MODES.includes(entry.mode))
    .map((entry) => `${entry.name}: mode "${entry.mode}" is not permitted in a read-only surface`);
}

function main() {
  const problems = [];

  // Read the baseline BEFORE regenerating, since generating overwrites it.
  const committed = readCommittedBaseline(problems);

  const first = buildAgentBundle();
  const second = buildAgentBundle();
  problems.push(...checkReproducible(first, second));
  problems.push(...checkMatchesBaseline(second.manifest, committed));
  problems.push(...checkHashes(second));

  const surface = parseSurfaceYaml(
    readFileSync(join(repo, "distribution/agent-command-surface.yaml"), "utf8"),
  );
  const registered = extractCliVerbs(
    readFileSync(join(repo, "packages/cli/src/index.ts"), "utf8"),
  );
  problems.push(...checkCliVerbsExist({ entries: surface.commands, registered }));
  problems.push(...checkReadOnlyModes(surface.commands));

  if (problems.length > 0) {
    process.stderr.write(`agent bundle verification failed:\n  ${problems.join("\n  ")}\n`);
    return 1;
  }
  process.stdout.write(
    `agent bundle verified: ${second.manifest.entries.length} files, ${registered.length} CLI verbs checked\n`,
  );
  return 0;
}

process.exit(main());
