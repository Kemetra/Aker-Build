export const REQUIRED_PACKAGE_FILES = [
  "dist/aker-build.js",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
];

function hasEntries(value) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

export function validateReleaseManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("release manifest must be an object");
  if (manifest.name !== "aker-build" || manifest.version !== "0.1.0") {
    throw new Error("release identity must be aker-build@0.1.0");
  }
  if (manifest.description !== "Aker Build — CLI-first SaaS Build Kernel" || manifest.type !== "module") {
    throw new Error("release package description/type mismatch");
  }
  if (manifest.bin?.["aker-build"] !== "dist/aker-build.js") {
    throw new Error("aker-build bin must target dist/aker-build.js");
  }
  if (manifest.engines?.node !== ">=22.13") throw new Error("Node engine must be >=22.13");
  if (manifest.private === true) throw new Error("generated release manifest cannot be private");

  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "bundledDependencies"]) {
    if (hasEntries(manifest[field])) throw new Error(`release package must have zero ${field}`);
  }
  if (JSON.stringify(manifest).includes("workspace:")) {
    throw new Error("release package cannot contain workspace protocol references");
  }

  const scripts = manifest.scripts ?? {};
  for (const name of ["preinstall", "install", "postinstall"]) {
    if (scripts[name]) throw new Error(`release package cannot define ${name}`);
  }
  if (JSON.stringify(manifest.files) !== JSON.stringify(REQUIRED_PACKAGE_FILES)) {
    throw new Error("release files allowlist mismatch");
  }
  if (
    manifest.license !== "MIT"
    || manifest.publishConfig?.access !== "public"
    || manifest.publishConfig?.registry !== "https://registry.npmjs.org/"
  ) {
    throw new Error("release license/publish metadata mismatch");
  }
  if (
    manifest.repository?.type !== "git"
    || !manifest.repository?.url
    || !manifest.homepage
    || !manifest.bugs?.url
    || !Array.isArray(manifest.keywords)
    || manifest.keywords.length === 0
  ) {
    throw new Error("release discovery metadata missing");
  }
}

export function validateVersion({ packageVersion, cliVersion }) {
  if (packageVersion !== cliVersion) {
    throw new Error(`release/CLI version mismatch: ${packageVersion} !== ${cliVersion}`);
  }
}

export function parseVerifierArgs(args) {
  if (args.length === 0) return {};
  if (args[0] !== "--tarball-dir" || args.length > 2) {
    throw new Error(`unknown verifier argument: ${args.join(" ")}`);
  }
  const value = args[1];
  if (!value || value.startsWith("--")) throw new Error("--tarball-dir requires a path");
  return { tarballDir: value };
}

export function validatePackedPaths(paths) {
  if (!Array.isArray(paths)) throw new Error("packed paths must be an array");
  const allowed = new Set(["package.json", ...REQUIRED_PACKAGE_FILES]);
  const normalized = paths.map((path) => path.replace(/^package\//, ""));
  const unexpected = normalized.filter((path) => !allowed.has(path));
  if (unexpected.length > 0) throw new Error(`unexpected packed files: ${unexpected.join(", ")}`);
  for (const required of allowed) {
    if (!normalized.includes(required)) throw new Error(`packed file missing: ${required}`);
  }
}
