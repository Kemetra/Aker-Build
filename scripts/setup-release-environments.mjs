// Creates the GitHub deployment environments the release workflows reference, each with a
// required reviewer so a dispatch stops for approval before it publishes.
//
// Why this exists as a script: the environments are repo *configuration*, not code, so nothing
// in the repo declared them and nothing verified they existed. `npm-release.yml` names
// `environment: npm-release`, and GitHub silently auto-creates a missing environment on first
// run **with no protection rules** — so a release could publish unreviewed while appearing to
// be gated. That failure is invisible in the workflow file, which is exactly why it needs a
// recorded, re-runnable setup step.
//
// Idempotent: PUT on an existing environment updates it rather than failing.
//
// Usage: node scripts/setup-release-environments.mjs [--dry-run]

import { execFileSync } from "node:child_process";

const REPO = "Kemetra/Aker-Build";

/** Both release workflows are dispatch-only and publish via OIDC; both must stop for a human. */
const ENVIRONMENTS = ["npm-release", "pypi"];

const dryRun = process.argv.includes("--dry-run");

function gh(args) {
  return execFileSync("gh", args, { encoding: "utf8" });
}

/**
 * The reviewer is the repo owner, looked up rather than hardcoded so this stays correct if the
 * account changes. `prevent_self_review` must stay false: a solo maintainer who dispatches the
 * release is also the only approver, and preventing self-review would deadlock the release.
 */
function reviewerId() {
  const owner = JSON.parse(gh(["api", `repos/${REPO}`, "--jq", "{login: .owner.login, id: .owner.id}"]));
  return { login: owner.login, id: owner.id };
}

function configure(environment, reviewer) {
  const args = [
    "api",
    "-X",
    "PUT",
    `repos/${REPO}/environments/${environment}`,
    "-f",
    "prevent_self_review=false",
    "-f",
    "reviewers[][type]=User",
    "-F",
    `reviewers[][id]=${reviewer.id}`,
  ];
  if (dryRun) {
    process.stdout.write(`[dry-run] gh ${args.join(" ")}\n`);
    return;
  }
  gh(args);
  const rules = gh([
    "api",
    `repos/${REPO}/environments/${environment}`,
    "--jq",
    "[.protection_rules[].type] | join(\",\")",
  ]).trim();
  if (!rules.includes("required_reviewers")) {
    throw new Error(`${environment}: required_reviewers was not applied (rules: ${rules || "none"})`);
  }
  process.stdout.write(`${environment}: required_reviewers = ${reviewer.login}\n`);
}

const reviewer = reviewerId();
for (const environment of ENVIRONMENTS) configure(environment, reviewer);
process.stdout.write(
  dryRun ? "dry run complete\n" : "both release environments require approval before publish\n",
);
