import { spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildCliPackage } from "./build-cli-package.mjs";
import { validatePackedPaths, validateReleaseManifest, validateVersion } from "./cli-package.mjs";

const repo = fileURLToPath(new URL("..", import.meta.url));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const git = process.platform === "win32" ? "git.exe" : "git";
const work = mkdtempSync(join(tmpdir(), "aker-build-package-smoke-"));

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    shell: process.platform === "win32" && command.toLowerCase().endsWith(".cmd"),
    windowsHide: true,
    env: {
      ...process.env,
      npm_config_audit: "false",
      npm_config_fund: "false",
    },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed\n${result.stdout}\n${result.stderr}`);
  }
  return result.stdout.trim();
}

try {
  const packageDir = await buildCliPackage();
  const cliSource = readFileSync(join(repo, "packages", "cli", "src", "version.ts"), "utf8")
    .match(/CLI_VERSION\s*=\s*"([^"]+)"/)?.[1];
  const manifest = JSON.parse(readFileSync(join(packageDir, "package.json"), "utf8"));
  validateReleaseManifest(manifest);
  validateVersion({ packageVersion: manifest.version, cliVersion: cliSource });

  const packJson = JSON.parse(run(
    npm,
    ["pack", "--json", "--pack-destination", work, packageDir],
    repo,
  ));
  const packed = packJson[0];
  if (!packed || packed.name !== manifest.name || packed.version !== manifest.version) {
    throw new Error("npm pack identity does not match the release manifest");
  }
  validatePackedPaths(packed.files.map((file) => file.path));
  const tarball = join(work, packed.filename);
  if (!existsSync(tarball)) throw new Error(`packed tarball missing: ${tarball}`);

  const consumer = join(work, "consumer");
  const fixture = join(work, "fixture");
  mkdirSync(consumer);
  writeFileSync(join(consumer, "package.json"), "{\"private\":true}\n");
  run(npm, ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball], consumer);

  cpSync(join(repo, "examples", "multi-tenant-saas-basic"), fixture, { recursive: true });
  run(git, ["init"], fixture);
  run(git, ["-c", "user.email=smoke@aker-build.local", "-c", "user.name=Aker Build Smoke", "-c", "commit.gpgsign=false", "add", "."], fixture);
  run(git, ["-c", "user.email=smoke@aker-build.local", "-c", "user.name=Aker Build Smoke", "-c", "commit.gpgsign=false", "commit", "-m", "fixture"], fixture);

  const bin = join(
    consumer,
    "node_modules",
    ".bin",
    process.platform === "win32" ? "aker-build.cmd" : "aker-build",
  );
  run(bin, ["--help"], consumer);
  const installedVersion = run(bin, ["--version"], consumer);
  validateVersion({ packageVersion: manifest.version, cliVersion: installedVersion });

  const output = join(work, "output");
  run(bin, ["check", fixture, "--out", output], consumer);
  for (const file of [
    "project-map.json",
    "risks.json",
    "queue.json",
    "route.json",
    "aker-build-report.json",
    "aker-build-report.md",
  ]) {
    if (!existsSync(join(output, file))) throw new Error(`smoke artifact missing: ${file}`);
  }
  const fixtureStatus = run(git, ["status", "--short"], fixture);
  if (fixtureStatus) throw new Error(`packed check mutated fixture source:\n${fixtureStatus}`);

  process.stdout.write(
    `Packed CLI smoke passed: ${packed.filename} (${packed.entryCount} files), installed ${installedVersion}\n`,
  );
} finally {
  rmSync(work, { recursive: true, force: true });
}
