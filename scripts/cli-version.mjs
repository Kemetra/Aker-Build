import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repo = fileURLToPath(new URL("..", import.meta.url));

/** Where the released version lives. `python/pyproject.toml` reads the same constant. */
export const CLI_VERSION_SOURCE = join("packages", "cli", "src", "version.ts");

/**
 * Read the released version from the committed TypeScript constant.
 *
 * Every producer in the release path must derive the version through here rather than restate it.
 * The npm builder used to write its own literal while this repo's verifier and `pyproject.toml`
 * both derived, so a bump produced a manifest and a binary that disagreed — and the release
 * identity check could not see it, because it compared its own literal to the builder's.
 */
export function readCliVersion(repoRoot = repo) {
  const source = readFileSync(join(repoRoot, CLI_VERSION_SOURCE), "utf8");
  const version = source.match(/CLI_VERSION\s*=\s*"([^"]+)"/)?.[1];
  if (!version) throw new Error(`could not read CLI_VERSION from ${CLI_VERSION_SOURCE}`);
  return version;
}
