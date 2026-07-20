export const REQUIRED_PACKAGE_FILES = [
  "dist/aker-build.js",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
];

function hasEntries(value) {
  if (!value || typeof value !== "object") return false;
  return Object.keys(value).length > 0;
}

function assertThat(condition, message) {
  if (!condition) throw new Error(message);
}

function validateReleaseIdentity(manifest) {
  const message = "release identity must be aker-build@0.1.0";
  assertThat(manifest.name === "aker-build", message);
  assertThat(manifest.version === "0.1.0", message);
}

function validateReleaseShape(manifest) {
  const message = "release package description/type mismatch";
  assertThat(manifest.description === "Aker Build — CLI-first SaaS Build Kernel", message);
  assertThat(manifest.type === "module", message);
  assertThat(manifest.bin?.["aker-build"] === "dist/aker-build.js", "aker-build bin must target dist/aker-build.js");
  assertThat(manifest.engines?.node === ">=22.13", "Node engine must be >=22.13");
  assertThat(manifest.private !== true, "generated release manifest cannot be private");
}

function validateDependencyBoundary(manifest) {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies", "bundledDependencies"]) {
    if (hasEntries(manifest[field])) throw new Error(`release package must have zero ${field}`);
  }
  assertThat(
    !JSON.stringify(manifest).includes("workspace:"),
    "release package cannot contain workspace protocol references",
  );
}

function validateLifecycleBoundary(manifest) {
  const scripts = manifest.scripts ?? {};
  for (const name of ["preinstall", "install", "postinstall"]) {
    if (scripts[name]) throw new Error(`release package cannot define ${name}`);
  }
}

function validatePublishMetadata(manifest) {
  const files = JSON.stringify(manifest.files);
  assertThat(files === JSON.stringify(REQUIRED_PACKAGE_FILES), "release files allowlist mismatch");
  const message = "release license/publish metadata mismatch";
  assertThat(manifest.license === "MIT", message);
  assertThat(manifest.publishConfig?.access === "public", message);
  assertThat(manifest.publishConfig?.registry === "https://registry.npmjs.org/", message);
}

function validateDiscoveryMetadata(manifest) {
  const message = "release discovery metadata missing";
  assertThat(manifest.repository?.type === "git", message);
  assertThat(Boolean(manifest.repository?.url), message);
  assertThat(Boolean(manifest.homepage), message);
  assertThat(Boolean(manifest.bugs?.url), message);
  assertThat(Array.isArray(manifest.keywords), message);
  assertThat(manifest.keywords.length > 0, message);
}

export function validateReleaseManifest(manifest) {
  assertThat(Boolean(manifest), "release manifest must be an object");
  assertThat(typeof manifest === "object", "release manifest must be an object");
  validateReleaseIdentity(manifest);
  validateReleaseShape(manifest);
  validateDependencyBoundary(manifest);
  validateLifecycleBoundary(manifest);
  validatePublishMetadata(manifest);
  validateDiscoveryMetadata(manifest);
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
