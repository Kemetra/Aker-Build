import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function validateReleasePreflight(input) {
  if (input.requestedVersion !== input.packageVersion) throw new Error("release version mismatch");
  if (input.gitRef !== `refs/tags/v${input.requestedVersion}`) {
    throw new Error("release ref must be refs/tags/v<version>");
  }
  if (!input.packageExists) {
    throw new Error("npm package bootstrap is required before trusted publishing");
  }
  if (input.versionExists) throw new Error(`aker-build@${input.requestedVersion} already exists`);
}

function npmViewExists(spec) {
  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  const result = spawnSync(npm, ["view", spec, "version", "--json"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status === 0) return true;
  const detail = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  if (/E404|404 Not Found|is not in this registry|No match found/i.test(detail)) return false;
  throw new Error(`npm registry lookup failed for ${spec}: ${detail.trim()}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const requestedVersion = process.argv[2];
    if (!requestedVersion) throw new Error("usage: node scripts/release-preflight.mjs <version>");
    const manifest = JSON.parse(
      readFileSync(resolve("packages/cli/dist/npm/package.json"), "utf8"),
    );
    const base = {
      requestedVersion,
      packageVersion: manifest.version,
      gitRef: process.env.GITHUB_REF ?? "",
    };
    validateReleasePreflight({ ...base, packageExists: true, versionExists: false });
    const packageExists = npmViewExists("aker-build");
    const versionExists = packageExists ? npmViewExists(`aker-build@${requestedVersion}`) : false;
    validateReleasePreflight({ ...base, packageExists, versionExists });
    process.stdout.write(`Release preflight passed for aker-build@${requestedVersion}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
