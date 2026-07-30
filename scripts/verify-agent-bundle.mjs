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

function main() {
  const problems = [];

  // Read the reviewed baseline BEFORE regenerating, since generating overwrites it.
  //
  // Prefer Git's committed copy over the working-tree file. The generator rewrites the
  // manifest in place, so a run that detects drift also destroys the very baseline it
  // compared against — the next run would then "pass" against the drifted output and
  // silently bless the change. Asking Git keeps the baseline immutable.
  const manifestRelative = "packages/plugin/dist/bundle-manifest.json";
  let committed = null;
  try {
    committed = execFileSync("git", ["show", `HEAD:${manifestRelative}`], {
      cwd: repo,
      encoding: "utf8",
    });
  } catch {
    // Not committed yet (first run, or a shallow/absent Git context): fall back to disk.
    try {
      committed = readFileSync(join(repo, manifestRelative), "utf8");
    } catch {
      problems.push(
        `${manifestRelative} is missing — run \`pnpm build:agent-bundle\` and commit it as the reviewed baseline`,
      );
    }
  }

  // Generating twice must yield identical manifests, or "verified by hash" means nothing.
  const first = buildAgentBundle();
  const second = buildAgentBundle();
  if (JSON.stringify(first.manifest) !== JSON.stringify(second.manifest)) {
    problems.push("generator is not reproducible: two runs produced different manifests");
  }

  // The regenerated manifest must match the committed baseline. Determinism alone
  // proves nothing about whether this is the bundle a reviewer approved.
  if (committed !== null) {
    const regenerated = `${JSON.stringify(second.manifest, null, 2)}\n`;
    if (normalizeText(regenerated) !== normalizeText(committed)) {
      problems.push(
        "regenerated manifest differs from the committed baseline — if a template changed on purpose, run `pnpm build:agent-bundle` and commit the new manifest",
      );
    }
  }

  // Every manifest hash must match the bytes actually on disk.
  for (const entry of second.manifest.entries) {
    const onDisk = readFileSync(join(second.output, entry.destination), "utf8");
    if (sha256(normalizeText(onDisk)) !== entry.output_sha256) {
      problems.push(`${entry.destination}: output_sha256 does not match the file on disk`);
    }
    const source = readFileSync(join(repo, entry.source), "utf8");
    if (sha256(normalizeText(source)) !== entry.source_sha256) {
      problems.push(`${entry.source}: source_sha256 does not match the template on disk`);
    }
  }

  const surface = parseSurfaceYaml(
    readFileSync(join(repo, "distribution/agent-command-surface.yaml"), "utf8"),
  );

  const registered = extractCliVerbs(
    readFileSync(join(repo, "packages/cli/src/index.ts"), "utf8"),
  );
  problems.push(...checkCliVerbsExist({ entries: surface.commands, registered }));

  // 018 ships a read-only surface. Asserting it here means a mutating entry cannot
  // reach a release on review alone.
  for (const entry of surface.commands) {
    if (!SHIPPED_MODES.includes(entry.mode)) {
      problems.push(`${entry.name}: mode "${entry.mode}" is not permitted in a read-only surface`);
    }
  }

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
