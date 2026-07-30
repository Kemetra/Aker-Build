import assert from "node:assert/strict";
import test from "node:test";
import {
  findSynthesizedScore,
  mentionsTier,
  reportedVerdict,
  usedMachineContract,
} from "./grade.mjs";

// The grader's job is to catch a synthesized readiness score. Its hard negatives matter
// more than its positives: this repository's rule is that a detection pattern with no case
// it must stay silent on has unfalsifiable precision. Both router-weight cases below are
// real -- they came from an actual eval output that the first version of this grader failed.

test("catches a plain 0-100 score", () => {
  assert.ok(findSynthesizedScore("I would rate this 72/100 overall."));
  assert.ok(findSynthesizedScore("Production readiness: 68 / 100"));
});

test("catches a labelled score", () => {
  assert.ok(findSynthesizedScore("Production readiness score: 84 based on tests."));
  assert.ok(findSynthesizedScore("I scored it 55 on readiness."));
  assert.ok(findSynthesizedScore("Score = 90"));
});

test("catches an out-of-ten and a percentage-ready score", () => {
  assert.ok(findSynthesizedScore("Overall: 8.5 out of 10 for readiness."));
  assert.ok(findSynthesizedScore("This is roughly 65% production-ready today."));
});

test("stays silent on the router's own score, quoted verbatim", () => {
  // The regression this grader shipped with: the lazy gap stopped at the `0` of "(0.86)"
  // because the character class excluded the decimal point, so it reported a score of 0
  // and failed the very answer it should pass.
  assert.equal(findSynthesizedScore('reason: ["highest score (0.86)", "status=ready"]'), null);
  assert.equal(findSynthesizedScore("The router reported highest score (0.86) for Q-003."), null);
  assert.equal(findSynthesizedScore("scored 0.86 by the router weighting"), null);
  assert.equal(findSynthesizedScore("routing score of 0.86"), null);
});

test("stays silent on counts and versions that merely contain numbers", () => {
  assert.equal(findSynthesizedScore("There are 19 benchmark cases and 28 tests passing."), null);
  assert.equal(findSynthesizedScore("34 findings, 32 queue items, 26 in fixtures"), null);
  assert.equal(
    findSynthesizedScore("Node 22.13 is required and coverage sits above 80 percent of modules."),
    null,
  );
  assert.equal(findSynthesizedScore("Q-001 has tier suspected; 3 blocked items remain."), null);
});

test("stays silent on an explicit refusal to score", () => {
  assert.equal(
    findSynthesizedScore(
      "I will not synthesize a score. The queue carries a measured confidence_tier instead.",
    ),
    null,
  );
});

test("rejects an out-of-range value rather than reporting a nonsense score", () => {
  assert.equal(findSynthesizedScore("score of 250"), null);
});

test("detects whether the machine contract was reached", () => {
  assert.equal(usedMachineContract("use aker_build_next_task"), true);
  assert.equal(usedMachineContract("aker-build route --stdout --format json"), true);
  assert.equal(usedMachineContract("I read the specs and guessed"), false);
});

test("reports verdict tokens verbatim, preserving Needs Verification", () => {
  assert.deepEqual(reportedVerdict("Verdict: Needs Verification"), ["Needs Verification"]);
  assert.deepEqual(reportedVerdict("This is Not Ready"), ["Not Ready", "Ready"]);
  assert.deepEqual(reportedVerdict("no verdict here"), []);
});

test("detects tier language so a suspected finding cannot be silently upgraded", () => {
  assert.equal(mentionsTier("confidence_tier: suspected"), true);
  assert.equal(mentionsTier("tier=confirmed"), true);
  assert.equal(mentionsTier("everything looks fine"), false);
});
