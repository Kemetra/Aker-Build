export const REQUIRED_PACKAGE_FILES = [
  "dist/aker.js",
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

/**
 * Release-manifest rules, as data. Each entry is a predicate that must hold plus the message
 * emitted when it does not. Kept as a table rather than a chain of `if`s because the checks are
 * independent: expressing them declaratively keeps each rule readable on its own line and makes
 * adding one a data change instead of another branch.
 *
 * Order is preserved and messages are unchanged, so failure behaviour is identical to the previous
 * inline form — the tests in cli-package.test.ts assert on these exact strings.
 *
 * Built per call rather than held as a module constant because the identity rule needs the expected
 * version. That version is a parameter, not a literal: as a literal it was compared against a
 * manifest the builder wrote from its own copy of the same literal, so the rule was a tautology
 * that could never fail. The module stays free of filesystem access — callers derive the version.
 */
function releaseManifestRules(expectedVersion) {
  return [
    {
      holds: (m) => m.name === "aker-build" && m.version === expectedVersion,
      message: `release identity must be aker-build@${expectedVersion}`,
    },
    {
      holds: (m) => m.description === "Aker Build — CLI-first SaaS Build Kernel" && m.type === "module",
      message: "release package description/type mismatch",
    },
    {
      holds: (m) => m.bin?.aker === "dist/aker.js",
      message: "aker bin must target dist/aker.js",
    },
    {
      holds: (m) => m.engines?.node === ">=22.13",
      message: "Node engine must be >=22.13",
    },
    {
      holds: (m) => m.private !== true,
      message: "generated release manifest cannot be private",
    },
    {
      holds: (m) => !JSON.stringify(m).includes("workspace:"),
      message: "release package cannot contain workspace protocol references",
    },
    {
      holds: (m) => JSON.stringify(m.files) === JSON.stringify(REQUIRED_PACKAGE_FILES),
      message: "release files allowlist mismatch",
    },
    {
      holds: (m) =>
        m.license === "MIT"
        && m.publishConfig?.access === "public"
        && m.publishConfig?.registry === "https://registry.npmjs.org/",
      message: "release license/publish metadata mismatch",
    },
    {
      holds: (m) =>
        m.repository?.type === "git"
        && Boolean(m.repository?.url)
        && Boolean(m.homepage)
        && Boolean(m.bugs?.url)
        && Array.isArray(m.keywords)
        && m.keywords.length > 0,
      message: "release discovery metadata missing",
    },
  ];
}

export function validateReleaseManifest(manifest, expectedVersion) {
  if (!manifest || typeof manifest !== "object") throw new Error("release manifest must be an object");
  if (typeof expectedVersion !== "string" || expectedVersion.length === 0) {
    throw new Error("release manifest validation requires the expected version");
  }

  for (const field of FORBIDDEN_DEPENDENCY_FIELDS) {
    if (hasEntries(manifest[field])) throw new Error(`release package must have zero ${field}`);
  }

  const scripts = manifest.scripts ?? {};
  for (const name of FORBIDDEN_LIFECYCLE_SCRIPTS) {
    if (scripts[name]) throw new Error(`release package cannot define ${name}`);
  }

  for (const rule of releaseManifestRules(expectedVersion)) {
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
