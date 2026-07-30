import assert from "node:assert/strict";
import test from "node:test";
import {
  checkCliVerbsExist,
  extractCliVerbs,
  normalizeText,
  parseFrontmatter,
  parseSurfaceYaml,
  reconcile,
  sha256,
  validateSurfaceEntry,
  validateWrapperText,
} from "./agent-bundle.mjs";

const valid = {
  name: "next",
  platform: "claude",
  intent: "Return the one next-safest task with derived scope.",
  cli_verbs: ["route"],
  skill: "aker-build",
  wrapper_template: "distribution/bundle-templates/claude/commands/next.md",
  bundle_destination: "commands/next.md",
  mode: "read-only",
  status: "shipped",
};

test("accepts a well-formed shipped entry", () => {
  assert.deepEqual(validateSurfaceEntry(valid), []);
});

test("rejects a mutating mode because 018 ships a read-only surface", () => {
  const problems = validateSurfaceEntry({ ...valid, mode: "mutating" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /mode/);
});

test("rejects a shipped entry with no wrapper template", () => {
  const problems = validateSurfaceEntry({ ...valid, wrapper_template: "" });
  assert.match(problems.join(" "), /wrapper_template/);
});

test("requires a deferred entry to ship no wrapper or destination", () => {
  const problems = validateSurfaceEntry({
    ...valid,
    name: "auto",
    status: "deferred",
  });
  assert.match(problems.join(" "), /deferred/);
});

test("accepts a deferred entry that declares no wrapper", () => {
  assert.deepEqual(
    validateSurfaceEntry({
      name: "auto",
      platform: "claude",
      intent: "Run the governed loop until the next human gate.",
      cli_verbs: [],
      skill: "aker-build",
      wrapper_template: "",
      bundle_destination: "",
      mode: "read-only",
      status: "deferred",
    }),
    [],
  );
});

test("accepts an empty cli_verbs list so the surface can carry verb-less commands", () => {
  assert.deepEqual(validateSurfaceEntry({ ...valid, name: "help", cli_verbs: [] }), []);
});

test("rejects an unknown platform", () => {
  assert.match(validateSurfaceEntry({ ...valid, platform: "codex" }).join(" "), /platform/);
});

const shipped = (name) => ({
  name,
  platform: "claude",
  intent: `Do ${name}.`,
  cli_verbs: [],
  skill: "aker-build",
  wrapper_template: `distribution/bundle-templates/claude/commands/${name}.md`,
  bundle_destination: `commands/${name}.md`,
  mode: "read-only",
  status: "shipped",
});

test("passes when the authority and the wrappers on disk agree", () => {
  assert.deepEqual(
    reconcile({
      entries: [shipped("check"), shipped("next")],
      wrapperPaths: [
        "distribution/bundle-templates/claude/commands/check.md",
        "distribution/bundle-templates/claude/commands/next.md",
      ],
    }),
    [],
  );
});

test("fails on a wrapper that no authority entry declares", () => {
  const problems = reconcile({
    entries: [shipped("check")],
    wrapperPaths: [
      "distribution/bundle-templates/claude/commands/check.md",
      "distribution/bundle-templates/claude/commands/sneaky.md",
    ],
  });
  assert.match(problems.join(" "), /sneaky\.md/);
});

test("fails on a shipped entry whose wrapper is missing from disk", () => {
  const problems = reconcile({
    entries: [shipped("check"), shipped("ghost")],
    wrapperPaths: ["distribution/bundle-templates/claude/commands/check.md"],
  });
  assert.match(problems.join(" "), /ghost\.md/);
});

test("ignores a deferred entry when reconciling wrappers", () => {
  const deferred = {
    ...shipped("auto"),
    status: "deferred",
    wrapper_template: "",
    bundle_destination: "",
  };
  assert.deepEqual(
    reconcile({
      entries: [shipped("check"), deferred],
      wrapperPaths: ["distribution/bundle-templates/claude/commands/check.md"],
    }),
    [],
  );
});

test("fails on two entries claiming the same bundle destination", () => {
  const clash = { ...shipped("next"), bundle_destination: "commands/check.md" };
  const problems = reconcile({
    entries: [shipped("check"), clash],
    wrapperPaths: [
      "distribution/bundle-templates/claude/commands/check.md",
      "distribution/bundle-templates/claude/commands/next.md",
    ],
  });
  assert.match(problems.join(" "), /duplicate/i);
});

test("parses a description out of wrapper frontmatter", () => {
  const parsed = parseFrontmatter("---\ndescription: Do the thing\n---\n\nBody text.\n");
  assert.equal(parsed.description, "Do the thing");
  assert.equal(parsed.body.trim(), "Body text.");
});

test("reports a null description when frontmatter is absent", () => {
  assert.equal(parseFrontmatter("Just a body.\n").description, null);
});

test("rejects a wrapper with no description because it drives slash-command discovery", () => {
  assert.match(validateWrapperText("No frontmatter here.\n").join(" "), /description/);
});

test("rejects a wrapper with an empty body", () => {
  assert.match(validateWrapperText("---\ndescription: Hi\n---\n\n").join(" "), /body/);
});

test("accepts a wrapper carrying both a description and a body", () => {
  assert.deepEqual(validateWrapperText("---\ndescription: Hi\n---\n\nLoad the skill.\n"), []);
});

test("extracts registered CLI verbs from the commander index source", () => {
  const source = `
    program.command("check").description("Run the chain");
    program.command("route").description("Select one next task");
  `;
  assert.deepEqual(extractCliVerbs(source), ["check", "route"]);
});

const SURFACE = `# a comment
schema_version: 1
canonical_repository: Kemetra/Aker-Build
commands:
  - name: help
    platform: claude
    intent: Show the map.
    cli_verbs: []
    skill: aker-build
    wrapper_template: distribution/bundle-templates/claude/commands/help.md
    bundle_destination: commands/help.md
    mode: read-only
    status: shipped
  - name: auto
    platform: claude
    intent: Run the loop.
    cli_verbs: [route, check]
    skill: aker-build
    wrapper_template: ""
    bundle_destination: ""
    mode: read-only
    status: deferred
`;

test("parses the surface authority into scalars and a command list", () => {
  const surface = parseSurfaceYaml(SURFACE);
  assert.equal(surface.schema_version, 1);
  assert.equal(surface.canonical_repository, "Kemetra/Aker-Build");
  assert.equal(surface.commands.length, 2);
});

test("parses an empty inline list, a populated one, and quoted empty strings", () => {
  const [help, auto] = parseSurfaceYaml(SURFACE).commands;
  assert.deepEqual(help.cli_verbs, []);
  assert.deepEqual(auto.cli_verbs, ["route", "check"]);
  assert.equal(auto.wrapper_template, "");
  assert.equal(help.bundle_destination, "commands/help.md");
});

test("keeps an intent containing a period intact", () => {
  assert.equal(parseSurfaceYaml(SURFACE).commands[0].intent, "Show the map.");
});

test("refuses a nested mapping rather than silently mis-parsing it", () => {
  const nested = SURFACE.replace("    status: shipped", "    status:\n      deep: value");
  assert.throws(() => parseSurfaceYaml(nested), /unsupported/i);
});

test("refuses a YAML anchor rather than ignoring it", () => {
  const anchored = SURFACE.replace("  - name: help", "  - name: &ref help");
  assert.throws(() => parseSurfaceYaml(anchored), /unsupported/i);
});

test("passes when every referenced CLI verb is registered", () => {
  assert.deepEqual(
    checkCliVerbsExist({
      entries: [{ name: "next", cli_verbs: ["route"], status: "shipped" }],
      registered: ["check", "route", "report"],
    }),
    [],
  );
});

test("fails on a referenced verb the CLI does not register", () => {
  const problems = checkCliVerbsExist({
    entries: [{ name: "ghost", cli_verbs: ["vanished"], status: "shipped" }],
    registered: ["check", "route"],
  });
  assert.match(problems.join(" "), /vanished/);
});

test("accepts a shipped command that references no verb", () => {
  assert.deepEqual(
    checkCliVerbsExist({
      entries: [{ name: "help", cli_verbs: [], status: "shipped" }],
      registered: ["check"],
    }),
    [],
  );
});

test("hashes CRLF and LF text identically so the manifest is platform-independent", () => {
  // Git checks this repository out with CRLF on Windows. If the hash depended on line
  // endings, the committed baseline could never match on both platforms.
  assert.equal(sha256(normalizeText("a\r\nb\r\n")), sha256(normalizeText("a\nb\n")));
});

test("normalizes to exactly one trailing newline", () => {
  assert.equal(normalizeText("x\n\n\n"), "x\n");
  assert.equal(normalizeText("x"), "x\n");
});
