export const REQUIRED_PACKAGE_FILES = [
  "dist/aker-build.js",
  "README.md",
  "LICENSE",
  "THIRD_PARTY_NOTICES.txt",
];

function hasEntries(value) {
  return value && typeof value === "object" && Object.keys(value).length > 0;
}

/** Dependency fields that must be absent — the zero-dependency guarantee of the release artifact. */
const FORBIDDEN_DEPENDENCY_FIELDS = [
  "dependencies",
  "optionalDependencies",
  "peerDependencies",
  "bundledDependencies",
];

/** Lifecycle scripts an installed package must not define (arbitrary code on `npm install`). */
const FORBIDDEN_LIFECYCLE_SCRIPTS = ["preinstall", "install", "postinstall"];

/** Every value in `expected` matches the manifest's value at the same key. */
function fieldsMatch(manifest, expected) {
  return Object.entries(expected).every(([key, value]) => manifest[key] === value);
}

function hasReleaseIdentity(m) {
  return fieldsMatch(m, { name: "aker-build", version: "0.1.0" });
}

function hasReleaseDescription(m) {
  return fieldsMatch(m, {
    description: "Aker Build — CLI-first SaaS Build Kernel",
    type: "module",
  });
}

function hasPublishMetadata(m) {
  return fieldsMatch(m.publishConfig ?? {}, {
    access: "public",
    registry: "https://registry.npmjs.org/",
  }) && m.license === "MIT";
}

function hasDiscoveryMetadata(m) {
  const present = [m.repository?.url, m.homepage, m.bugs?.url].every(Boolean);
  return present && m.repository?.type === "git" && Array.isArray(m.keywords) && m.keywords.length > 0;
}

/**
 * Release-manifest rules, as data. Each entry is a predicate that must hold plus the message
 * emitted when it does not. Kept as a table rather than a chain of `if`s because the checks are
 * independent: expressing them declaratively keeps each rule readable on its own line and makes
 * adding one a data change instead of another branch. Multi-clause predicates are named functions
 * so their branches belong to the check they describe rather than to the validator.
 *
 * Order is preserved and messages are unchanged, so failure behaviour is identical to the original
 * inline form — the tests in cli-package.test.ts assert on these exact strings.
 */
const RELEASE_MANIFEST_RULES = [
  { holds: hasReleaseIdentity, message: "release identity must be aker-build@0.1.0" },
  { holds: hasReleaseDescription, message: "release package description/type mismatch" },
  {
    holds: (m) => m.bin?.["aker-build"] === "dist/aker-build.js",
    message: "aker-build bin must target dist/aker-build.js",
  },
  { holds: (m) => m.engines?.node === ">=22.13", message: "Node engine must be >=22.13" },
  { holds: (m) => m.private !== true, message: "generated release manifest cannot be private" },
  {
    holds: (m) => !JSON.stringify(m).includes("workspace:"),
    message: "release package cannot contain workspace protocol references",
  },
  {
    holds: (m) => JSON.stringify(m.files) === JSON.stringify(REQUIRED_PACKAGE_FILES),
    message: "release files allowlist mismatch",
  },
  { holds: hasPublishMetadata, message: "release license/publish metadata mismatch" },
  { holds: hasDiscoveryMetadata, message: "release discovery metadata missing" },
];

export function validateReleaseManifest(manifest) {
  if (!manifest || typeof manifest !== "object") throw new Error("release manifest must be an object");

  for (const field of FORBIDDEN_DEPENDENCY_FIELDS) {
    if (hasEntries(manifest[field])) throw new Error(`release package must have zero ${field}`);
  }

  const scripts = manifest.scripts ?? {};
  for (const name of FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (scripts[name]) throw new Error(`release package cannot define ${name}`);
  }

  for (const rule of RELEASE_MANIFEST_RULES) {
    if (!rule.holds(manifest)) throw new Error(rule.message);
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
