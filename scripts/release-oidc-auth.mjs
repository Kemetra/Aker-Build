// Standing guard: a workflow that publishes to npm via OIDC must not configure a registry
// auth token.
//
// `actions/setup-node` with `registry-url` writes an .npmrc containing
//
//   //registry.npmjs.org/:_authToken=${NODE_AUTH_TOKEN}
//
// and points NPM_CONFIG_USERCONFIG at it. When no token is supplied it still sets
// NODE_AUTH_TOKEN to the literal placeholder `XXXXX-XXXXX-XXXXX-XXXXX`. npm then finds a
// configured token for the registry and authenticates with that placeholder instead of
// exchanging its OIDC identity, so Trusted Publishing is never attempted.
//
// The failure is unreadable from the log. npm answers an unauthorized PUT on a package that
// exists with 404 rather than 403 -- it will not confirm a package's existence to a caller who
// is not entitled to know -- so the error reads `404 Not Found - PUT .../aker-build`, which
// looks like a missing package rather than rejected credentials. Provenance signing succeeds
// first, because that uses the OIDC token directly and does not involve the registry, which
// makes the log look like OIDC is working.
//
// `registry-url` is redundant for this repo: the generated release manifest carries
// `publishConfig.registry`, which validateReleaseManifest requires, and npm honours it on
// publish. So the setting's only real effect here is to disable the auth path it appears to
// enable.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const WORKFLOWS = join(".github", "workflows");
const YAML_EXTENSIONS = [".yml", ".yaml"];

const NPM_PUBLISH = /(^|\s)npm\s+publish(\s|$)/;
const ID_TOKEN_WRITE = /^\s*id-token:\s*write\s*$/;
const REGISTRY_URL = /^\s*registry-url:/;

function toPosix(path) {
  return path.split(sep).join("/");
}

function workflowFiles(root) {
  const dir = join(root, WORKFLOWS);
  try {
    if (!statSync(dir).isDirectory()) return [];
  } catch {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => YAML_EXTENSIONS.some((ext) => entry.endsWith(ext)))
    .map((entry) => join(dir, entry));
}

/**
 * Workflows that publish to npm under an OIDC identity while also configuring a registry auth
 * token. Both conditions are required: `registry-url` is legitimate in a workflow that
 * authenticates with a real token, and harmless in one that never publishes to npm.
 */
export function findOidcAuthConflicts(root) {
  const found = [];
  for (const full of workflowFiles(root)) {
    const lines = readFileSync(full, "utf8").split("\n");
    const publishesToNpm = lines.some((line) => NPM_PUBLISH.test(line));
    const usesOidc = lines.some((line) => ID_TOKEN_WRITE.test(line));
    if (!publishesToNpm || !usesOidc) continue;
    lines.forEach((line, index) => {
      if (!REGISTRY_URL.test(line)) return;
      found.push({ file: toPosix(relative(root, full)), line: index + 1 });
    });
  }
  return found;
}
