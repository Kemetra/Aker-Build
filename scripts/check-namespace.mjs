import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const ACTIVE_ROOT_FILES = new Set([
  "README.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "package.json",
  "pnpm-workspace.yaml",
  "aker-build.config.json",
  ".specify/feature.json",
]);

const ACTIVE_PREFIXES = [
  "packages/",
  "scripts/",
  ".github/workflows/",
  "contracts/",
  "docs/status/",
  "docs/roadmap/",
  "docs/demo/",
  "specs/014-github-app-report-only/",
  "specs/015-github-app-deployment/",
  "specs/016-release-integrity/",
];

const ACTIVE_EXTENSION = /\.(?:ts|tsx|js|mjs|cjs|json|md|ya?ml|ps1)$/i;
const DEFAULT_ALLOWLIST = new Set([
  "specs/016-release-integrity/spec.md",
  "specs/016-release-integrity/research.md",
  "specs/016-release-integrity/plan.md",
  "specs/016-release-integrity/tasks.md",
]);

const formerName = ["tenant", "guard"].join("");
const formerTempPrefix = ["t", "g", "-"].join("");
const formerSmokePrefix = ["T", "G", "_SMOKE_"].join("");

function normalizePath(path) {
  return path.replaceAll("\\", "/");
}

export function isActivePath(path) {
  const normalized = normalizePath(path);
  if (!ACTIVE_EXTENSION.test(normalized)) return false;
  return ACTIVE_ROOT_FILES.has(normalized)
    || ACTIVE_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function findLegacyReferences(entries, allowedPaths = DEFAULT_ALLOWLIST) {
  const findings = [];
  for (const entry of entries) {
    const path = normalizePath(entry.path);
    if (!isActivePath(path) || allowedPaths.has(path)) continue;
    const lines = entry.content.split(/\r?\n/);
    lines.forEach((line, index) => {
      const lower = line.toLowerCase();
      if (lower.includes(formerName)) {
        findings.push({ path, line: index + 1, identifier: formerName });
      }
      if (line.includes(formerTempPrefix)) {
        findings.push({ path, line: index + 1, identifier: formerTempPrefix });
      }
      if (line.includes(formerSmokePrefix)) {
        findings.push({ path, line: index + 1, identifier: formerSmokePrefix });
      }
    });
  }
  return findings.sort((a, b) =>
    a.path.localeCompare(b.path)
      || a.line - b.line
      || a.identifier.localeCompare(b.identifier),
  );
}

export function readCandidateEntries(repoRoot) {
  const output = execFileSync(
    "git",
    [
      "-c",
      `safe.directory=${normalizePath(repoRoot)}`,
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "-z",
    ],
    { cwd: repoRoot, encoding: "utf8" },
  );
  return output
    .split("\0")
    .filter(Boolean)
    .filter(isActivePath)
    .map((path) => ({
      path: normalizePath(path),
      content: readFileSync(resolve(repoRoot, path), "utf8"),
    }));
}

function main() {
  const entries = readCandidateEntries(process.cwd());
  const findings = findLegacyReferences(entries);
  if (findings.length === 0) {
    console.log(`Namespace integrity passed (${entries.length} active files scanned).`);
    return;
  }
  for (const finding of findings) {
    console.error(
      `${finding.path}:${finding.line}: legacy identifier ${JSON.stringify(finding.identifier)}`,
    );
  }
  process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (invokedPath === import.meta.url) main();
