import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { validateReleaseManifest } from "./cli-package.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = join(repo, "packages", "cli", "dist", "npm");

function dependencyRoot(name, fromManifest) {
  const localRequire = createRequire(join(repo, fromManifest));
  let current = dirname(localRequire.resolve(name));
  while (!existsSync(join(current, "package.json"))) {
    const parent = dirname(current);
    if (parent === current) throw new Error(`package root not found: ${name}`);
    current = parent;
  }
  return current;
}

function licenseText(name, fromManifest) {
  const root = dependencyRoot(name, fromManifest);
  const license = readdirSync(root).find(
    (file) => /^licen[cs]e/i.test(file) && statSync(join(root, file)).isFile(),
  );
  if (!license) throw new Error(`license file not found: ${name}`);
  return `===== ${name} =====\n${readFileSync(join(root, license), "utf8").trim()}\n`;
}

export async function buildCliPackage() {
  rmSync(output, { recursive: true, force: true });
  mkdirSync(join(output, "dist"), { recursive: true });

  await build({
    entryPoints: [join(repo, "packages", "cli", "src", "bin.ts")],
    outfile: join(output, "dist", "aker-build.js"),
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node22",
    legalComments: "none",
    sourcemap: false,
    banner: {
      js: 'import { createRequire as __akerBuildCreateRequire } from "node:module"; const require = __akerBuildCreateRequire(import.meta.url);',
    },
  });

  const executablePath = join(output, "dist", "aker-build.js");
  const executable = readFileSync(executablePath, "utf8");
  if (!executable.startsWith("#!/usr/bin/env node")) {
    throw new Error("built CLI is missing its node shebang");
  }
  chmodSync(executablePath, 0o755);

  const manifest = {
    name: "aker-build",
    version: "0.1.0",
    description: "Aker Build — CLI-first SaaS Build Kernel",
    license: "MIT",
    type: "module",
    bin: { "aker-build": "dist/aker-build.js" },
    files: ["dist/aker-build.js", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.txt"],
    engines: { node: ">=22.13" },
    repository: { type: "git", url: "git+https://github.com/Kemetra/Aker-Build.git" },
    homepage: "https://github.com/Kemetra/Aker-Build#readme",
    bugs: { url: "https://github.com/Kemetra/Aker-Build/issues" },
    keywords: ["cli", "saas", "architecture", "code-review", "static-analysis"],
    publishConfig: { access: "public", registry: "https://registry.npmjs.org/" },
  };
  validateReleaseManifest(manifest);

  writeFileSync(join(output, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  copyFileSync(join(repo, "packages", "cli", "README.md"), join(output, "README.md"));
  copyFileSync(join(repo, "LICENSE"), join(output, "LICENSE"));
  const licenses = [
    licenseText("commander", "packages/cli/package.json"),
    licenseText("yaml", "packages/cli/package.json"),
    licenseText("zod", "packages/project-map/package.json"),
  ];
  writeFileSync(
    join(output, "THIRD_PARTY_NOTICES.txt"),
    ["Bundled third-party licenses", ...licenses].join("\n\n"),
  );
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  buildCliPackage()
    .then((path) => process.stdout.write(`${path}\n`))
    .catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
      process.exitCode = 1;
    });
}
