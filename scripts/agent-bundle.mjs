// Pure helpers for the agent-surface bundle. Kept free of filesystem writes so the
// validation rules can be unit-tested directly, matching scripts/cli-package.mjs.

import { createHash } from "node:crypto";

export const SHIPPED_MODES = ["read-only"];
const PLATFORMS = ["claude"];
const STATUSES = ["shipped", "deferred", "internal"];
const REQUIRED_FIELDS = [
  "name",
  "platform",
  "intent",
  "cli_verbs",
  "skill",
  "wrapper_template",
  "bundle_destination",
  "mode",
  "status",
];

/**
 * Validate one command-surface entry, returning a problem string per rule broken.
 *
 * Returning a list rather than throwing lets the caller report every problem in one
 * pass; a generator that failed on the first bad entry would make fixing a surface
 * an iterative guessing game.
 */
export function validateSurfaceEntry(entry) {
  const problems = [];
  if (entry === null || typeof entry !== "object") return ["entry is not an object"];

  for (const field of REQUIRED_FIELDS) {
    if (!(field in entry)) problems.push(`${entry.name ?? "(unnamed)"}: missing ${field}`);
  }
  if (problems.length > 0) return problems;

  const id = entry.name;
  if (typeof id !== "string" || !/^[a-z][a-z0-9-]*$/.test(id)) {
    problems.push(`${id}: name must be lower-kebab-case`);
  }
  if (!PLATFORMS.includes(entry.platform)) {
    problems.push(`${id}: platform must be one of ${PLATFORMS.join(", ")}`);
  }
  if (typeof entry.intent !== "string" || entry.intent.trim() === "") {
    problems.push(`${id}: intent must be a non-empty string`);
  }
  if (!Array.isArray(entry.cli_verbs)) {
    problems.push(`${id}: cli_verbs must be an array (empty is allowed)`);
  }
  if (!STATUSES.includes(entry.status)) {
    problems.push(`${id}: status must be one of ${STATUSES.join(", ")}`);
  }
  // 018 ships a read-only surface; a mutating entry must be a recorded decision,
  // not a quiet edit, so the rule lives in code rather than in review habit.
  if (!SHIPPED_MODES.includes(entry.mode)) {
    problems.push(`${id}: mode must be one of ${SHIPPED_MODES.join(", ")}`);
  }

  const shipped = entry.status === "shipped";
  if (shipped && (!entry.wrapper_template || !entry.bundle_destination)) {
    problems.push(`${id}: shipped entries need wrapper_template and bundle_destination`);
  }
  if (!shipped && (entry.wrapper_template || entry.bundle_destination)) {
    problems.push(
      `${id}: ${entry.status} entries must declare no wrapper_template or bundle_destination`,
    );
  }
  return problems;
}

/**
 * Reconcile the authority against the wrappers that actually exist on disk.
 *
 * Both directions matter. Checking only authority-to-disk lets an unreviewed wrapper
 * ship; checking only disk-to-authority lets the authority advertise a command that
 * does not exist. Together they make the surface reviewed rather than accumulated.
 */
export function reconcile({ entries, wrapperPaths }) {
  const problems = [];
  const shipped = entries.filter((e) => e.status === "shipped");

  const declared = new Set(shipped.map((e) => e.wrapper_template));
  const onDisk = new Set(wrapperPaths);

  for (const path of onDisk) {
    if (!declared.has(path)) {
      problems.push(`wrapper ${path} is absent from the command surface authority`);
    }
  }
  for (const entry of shipped) {
    if (!onDisk.has(entry.wrapper_template)) {
      problems.push(
        `${entry.name}: declared wrapper ${entry.wrapper_template} is missing on disk`,
      );
    }
  }

  const seenNames = new Set();
  const seenDestinations = new Set();
  for (const entry of entries) {
    if (seenNames.has(entry.name)) problems.push(`duplicate command name ${entry.name}`);
    seenNames.add(entry.name);
    if (entry.status !== "shipped") continue;
    if (seenDestinations.has(entry.bundle_destination)) {
      problems.push(`duplicate bundle destination ${entry.bundle_destination}`);
    }
    seenDestinations.add(entry.bundle_destination);
  }
  return problems;
}
