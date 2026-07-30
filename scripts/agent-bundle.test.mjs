import assert from "node:assert/strict";
import test from "node:test";
import { reconcile, validateSurfaceEntry } from "./agent-bundle.mjs";

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
