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
/** Field-level rules, each a predicate plus the message for when it fails. */
const FIELD_RULES = [
  {
    ok: (e) => typeof e.name === "string" && /^[a-z][a-z0-9-]*$/.test(e.name),
    message: () => "name must be lower-kebab-case",
  },
  {
    ok: (e) => PLATFORMS.includes(e.platform),
    message: () => `platform must be one of ${PLATFORMS.join(", ")}`,
  },
  {
    ok: (e) => typeof e.intent === "string" && e.intent.trim() !== "",
    message: () => "intent must be a non-empty string",
  },
  {
    ok: (e) => Array.isArray(e.cli_verbs),
    message: () => "cli_verbs must be an array (empty is allowed)",
  },
  {
    ok: (e) => STATUSES.includes(e.status),
    message: () => `status must be one of ${STATUSES.join(", ")}`,
  },
  {
    // 018 ships a read-only surface; a mutating entry must be a recorded decision,
    // not a quiet edit, so the rule lives in code rather than in review habit.
    ok: (e) => SHIPPED_MODES.includes(e.mode),
    message: () => `mode must be one of ${SHIPPED_MODES.join(", ")}`,
  },
];

/**
 * A shipped command needs a wrapper; a deferred or internal one must not have one.
 * Both directions matter: the first would advertise a command with no prompt behind it,
 * the second would ship a file the authority says does not exist yet.
 */
function declaresWrapper(entry) {
  return Boolean(entry.wrapper_template) && Boolean(entry.bundle_destination);
}

function declaresNeither(entry) {
  return !entry.wrapper_template && !entry.bundle_destination;
}

function checkWrapperPairing(entry) {
  if (entry.status === "shipped") {
    return declaresWrapper(entry)
      ? []
      : ["shipped entries need wrapper_template and bundle_destination"];
  }
  return declaresNeither(entry)
    ? []
    : [`${entry.status} entries must declare no wrapper_template or bundle_destination`];
}

function findMissingFields(entry) {
  return REQUIRED_FIELDS.filter((field) => !(field in entry)).map(
    (field) => `${entry.name ?? "(unnamed)"}: missing ${field}`,
  );
}

export function validateSurfaceEntry(entry) {
  if (entry === null || typeof entry !== "object") return ["entry is not an object"];

  // Absent fields first: every rule below would otherwise report a second, derived
  // problem for the same root cause.
  const missing = findMissingFields(entry);
  if (missing.length > 0) return missing;

  return [
    ...FIELD_RULES.filter((rule) => !rule.ok(entry)).map((rule) => rule.message(entry)),
    ...checkWrapperPairing(entry),
  ].map((message) => `${entry.name}: ${message}`);
}

/**
 * Reconcile the authority against the wrappers that actually exist on disk.
 *
 * Both directions matter. Checking only authority-to-disk lets an unreviewed wrapper
 * ship; checking only disk-to-authority lets the authority advertise a command that
 * does not exist. Together they make the surface reviewed rather than accumulated.
 */
/** A wrapper on disk that no authority entry declares would ship unreviewed. */
function findUndeclaredWrappers(shipped, onDisk) {
  const declared = new Set(shipped.map((e) => e.wrapper_template));
  return [...onDisk]
    .filter((path) => !declared.has(path))
    .map((path) => `wrapper ${path} is absent from the command surface authority`);
}

/** An entry whose wrapper is absent would advertise a command that does not exist. */
function findMissingWrappers(shipped, onDisk) {
  return shipped
    .filter((entry) => !onDisk.has(entry.wrapper_template))
    .map((entry) => `${entry.name}: declared wrapper ${entry.wrapper_template} is missing on disk`);
}

/** Values that must be unique across the surface, keyed by what they collide on. */
function findDuplicates(entries) {
  const problems = [];
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

export function reconcile({ entries, wrapperPaths }) {
  const shipped = entries.filter((e) => e.status === "shipped");
  const onDisk = new Set(wrapperPaths);
  return [
    ...findUndeclaredWrappers(shipped, onDisk),
    ...findMissingWrappers(shipped, onDisk),
    ...findDuplicates(entries),
  ];
}

/**
 * Read the `description` field out of a wrapper's YAML frontmatter.
 *
 * Deliberately a narrow line-scanner rather than a YAML parse: a wrapper's frontmatter
 * carries exactly one scalar field, and keeping this dependency-free lets the verifier
 * run before any install step.
 */
export function parseFrontmatter(text) {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return { description: null, body: normalized };
  const end = normalized.indexOf("\n---", 3);
  if (end === -1) return { description: null, body: normalized };

  const block = normalized.slice(4, end);
  const body = normalized.slice(end + 4);
  let description = null;
  for (const line of block.split("\n")) {
    const match = /^description:\s*(.+)$/.exec(line.trim());
    if (match) description = match[1].trim().replace(/^["']|["']$/g, "");
  }
  return { description, body };
}

/** A wrapper needs a description (it is what an agent sees when choosing a command) and a body. */
export function validateWrapperText(text) {
  const problems = [];
  const { description, body } = parseFrontmatter(text);
  if (!description) problems.push("wrapper is missing a frontmatter description");
  if (body.trim() === "") problems.push("wrapper has an empty body");
  return problems;
}

/**
 * List the verbs Commander actually registers in the CLI entrypoint.
 *
 * This is what makes the projection rule enforceable: if a verb is renamed, a surface
 * entry referencing the old name fails the build instead of quietly advertising a verb
 * that no longer exists.
 */
export function extractCliVerbs(indexSource) {
  const verbs = [];
  const pattern = /\.command\(\s*"([a-z][a-z0-9-]*)"/g;
  let match;
  while ((match = pattern.exec(indexSource)) !== null) verbs.push(match[1]);
  return verbs;
}

/**
 * Confirm every referenced CLI verb still exists.
 *
 * The surface is a projection of the CLI, so a renamed verb must break the build
 * loudly rather than leave the bundle advertising a verb that no longer resolves.
 */
/** The verbs one entry references that the CLI does not register. */
function unknownVerbsFor(entry, known) {
  return (entry.cli_verbs ?? [])
    .filter((verb) => !known.has(verb))
    .map((verb) => `${entry.name}: references CLI verb "${verb}" which is not registered`);
}

export function checkCliVerbsExist({ entries, registered }) {
  const known = new Set(registered);
  return entries
    .filter((entry) => entry.status === "shipped")
    .flatMap((entry) => unknownVerbsFor(entry, known));
}

/** Normalize to LF with exactly one trailing newline so hashes are stable across platforms. */
export function normalizeText(text) {
  return `${text.replace(/\r\n/g, "\n").replace(/\n+$/, "")}\n`;
}

export function sha256(text) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * One manifest entry per generated file, mirroring the shape Spec 017 already proves.
 *
 * Both hashes are taken over normalized text. Git converts line endings on checkout
 * (this repository checks out CRLF on Windows), so hashing raw bytes would make the
 * manifest platform-dependent and the baseline comparison would fail on a clean clone
 * for a reason that has nothing to do with content.
 */
export function manifestEntry({
  source,
  sourceText,
  destination,
  outputText,
  transform,
  classification,
}) {
  return {
    classification,
    destination,
    output_sha256: sha256(normalizeText(outputText)),
    source,
    source_sha256: sha256(normalizeText(sourceText)),
    transform,
  };
}

/** Strip surrounding quotes and coerce the few scalar shapes the authority uses. */
function parseScalar(raw) {
  const text = raw.trim();
  if (text === "") return "";
  if (/^".*"$/.test(text) || /^'.*'$/.test(text)) return text.slice(1, -1);
  if (/^\[.*\]$/.test(text)) {
    const inner = text.slice(1, -1).trim();
    if (inner === "") return [];
    return inner.split(",").map((part) => parseScalar(part));
  }
  if (/^-?\d+$/.test(text)) return Number(text);
  return text;
}

/**
 * Parse the command-surface authority.
 *
 * Hand-rolled rather than pulled from a YAML library on purpose: this module backs the
 * verifier that answers "is this bundle trustworthy?", and a verifier with no third-party
 * dependencies can run on a fresh clone before any install step. The authority uses a
 * deliberately small subset — two top-level scalars and a list of flat maps with inline
 * arrays — so the cost of parsing it directly is low.
 *
 * The strictness is the point. A parser that quietly mis-reads a construct it does not
 * support is worse than one that refuses, because the surface it produces would look
 * valid while describing something else. Anything outside the subset throws.
 */
/** Blank and comment-only lines carry no data. */
function isSkippableLine(line) {
  return line.trim() === "" || line.trimStart().startsWith("#");
}

/** Anchors, aliases, and merge keys change what a document means, so refuse them outright. */
function rejectAnchors(line, where) {
  if (/(^|\s)[&*][A-Za-z0-9_-]+/.test(line) || /<<:/.test(line)) {
    throw new Error(`${where}: unsupported YAML anchor or alias in the command surface`);
  }
}

/** `key: value` at column 0 — one of the document's two top-level scalars, or `commands:`. */
function parseTopLevelLine(body, where, root) {
  const match = /^([a-z_]+):\s*(.*)$/.exec(body);
  if (!match) throw new Error(`${where}: unsupported top-level line "${body}"`);
  const [, key, value] = match;
  if (key === "commands") {
    if (value.trim() !== "") throw new Error(`${where}: commands must be a block list`);
    return;
  }
  if (value.trim() === "") throw new Error(`${where}: unsupported empty scalar for ${key}`);
  root[key] = parseScalar(value);
}

/** `- key: value` — opens a new command and returns it as the current item. */
function parseListItemLine(body, where) {
  const match = /^-\s+([a-z_]+):\s*(.*)$/.exec(body);
  if (!match) throw new Error(`${where}: unsupported list item "${body}"`);
  return { [match[1]]: parseScalar(match[2]) };
}

// The only two fields allowed to be empty: a deferred command declares no wrapper.
const MAY_BE_EMPTY = new Set(["wrapper_template", "bundle_destination"]);

/** `key: value` indented under the current command. */
function parseMappingLine(body, where, current) {
  const match = /^([a-z_]+):\s*(.*)$/.exec(body);
  if (!match) throw new Error(`${where}: unsupported mapping line "${body}"`);
  if (current === null) throw new Error(`${where}: mapping outside any list item`);
  const [, key, value] = match;
  // A key with no inline value would introduce nesting, which this subset excludes.
  if (value.trim() === "" && !MAY_BE_EMPTY.has(key)) {
    throw new Error(`${where}: unsupported nested mapping under "${key}"`);
  }
  current[key] = parseScalar(value);
}

export function parseSurfaceYaml(text) {
  const root = {};
  const commands = [];
  let current = null;

  const lines = text.replace(/\r\n/g, "\n").split("\n");
  for (const [index, line] of lines.entries()) {
    if (isSkippableLine(line)) continue;

    const where = `line ${index + 1}`;
    rejectAnchors(line, where);

    const body = line.trim();
    const atTopLevel = line.length === body.length;

    if (atTopLevel) {
      parseTopLevelLine(body, where, root);
    } else if (body.startsWith("- ")) {
      current = parseListItemLine(body, where);
      commands.push(current);
    } else {
      parseMappingLine(body, where, current);
    }
  }

  return { ...root, commands };
}
