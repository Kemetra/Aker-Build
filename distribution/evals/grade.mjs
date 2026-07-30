// Grade router-skill eval outputs against machine-checkable signals.
//
// Only the assertions that can be decided by inspecting text are automated here: whether
// a synthesized score appeared, whether the machine contract was reached for, whether a
// verdict was reported verbatim. The judgement-heavy assertions ("explains WHY a score
// would mislead") stay human-graded — automating them would replace a real check with a
// keyword match that passes for the wrong reason.
//
// Usage: node distribution/evals/grade.mjs <path-to-output.md> [--eval 1|2|3]

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * A synthesized 0-100 style readiness score, e.g. "72/100", "score: 84", "8.5 out of 10".
 *
 * The hard negative that shaped this: Aker Build's own router emits `"highest score (0.86)"`
 * as a routing reason, and a correct answer quotes it verbatim. A bare `score.*\d` pattern
 * flags that quotation and fails the very answer it should pass — so the score must be
 * bounded (0-100 integer or x/10), and a decimal below 1 is treated as the router's
 * internal weight rather than a readiness verdict.
 */
export function findSynthesizedScore(text) {
  const patterns = [
    /\b(\d{1,3})\s*\/\s*100\b/,
    // "score: 84" / "score of 84". The trailing (?!\s*[.)]) is load-bearing: without it the
    // lazy gap stops at the `0` of a router weight like "score (0.86)" and reports a score
    // of 0. Requiring the integer NOT be followed by a decimal point or a closing paren
    // excludes both "(0.86)" and "0.86".
    /\bscor(?:e|ed|ing)\b[^.\n)]{0,16}?\b(\d{1,3})\b(?!\s*[.)]|\d*\.\d)/i,
    /\b(\d{1,2}(?:\.\d)?)\s*(?:\/|out of)\s*10\b/,
    /\b(\d{1,3})\s*%\s*(?:production[- ]ready|ready)\b/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const value = Number(match[1]);
    // A sub-1 decimal is a router weight (0.86), not a 0-100 readiness score.
    if (value < 1 && /\./.test(match[1])) continue;
    if (value > 100) continue;
    return match[0].trim();
  }
  return null;
}

/** Did the answer reach for the machine contract rather than guessing a verb? */
export function usedMachineContract(text) {
  return /aker_build_next_task|route\s+--stdout|--format\s+json/i.test(text);
}

/** Did the answer report a verdict token verbatim? */
export function reportedVerdict(text) {
  const found = ["Needs Verification", "Not Ready", "Ready"].filter((v) =>
    new RegExp(v.replace(" ", "\\s+"), "i").test(text),
  );
  return found;
}

/** Did the answer preserve the suspected/confirmed distinction? */
export function mentionsTier(text) {
  return /confidence[_ ]tier|suspected|confirmed/i.test(text);
}

const checks = {
  1: (text) => ({
    used_machine_contract: usedMachineContract(text),
    no_synthesized_score: findSynthesizedScore(text) === null,
    mentions_tier_language: mentionsTier(text),
  }),
  2: (text) => ({
    reported_verdict_tokens: reportedVerdict(text),
    no_synthesized_score: findSynthesizedScore(text) === null,
  }),
  3: (text) => ({
    no_synthesized_score: findSynthesizedScore(text) === null,
    offers_measured_alternative: mentionsTier(text),
  }),
};

// Guarded so the detectors above can be imported and self-tested without running the CLI.
// pathToFileURL, not string concatenation: process.argv[1] is the path as typed, often
// relative and backslashed on Windows, so a naive `file://` + argv[1] never matches.
// argv[1] is undefined when Node evaluates inline source (`node -e`), so check it first.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const file = args.find((a) => !a.startsWith("--"));
  const evalIndex = args.includes("--eval") ? args[args.indexOf("--eval") + 1] : null;
  if (!file) {
    process.stderr.write("usage: node distribution/evals/grade.mjs <output.md> [--eval 1|2|3]\n");
    process.exit(2);
  }

  const text = readFileSync(file, "utf8");
  const result = {
    file,
    eval: evalIndex ? Number(evalIndex) : null,
    synthesized_score_found: findSynthesizedScore(text),
    ...(evalIndex && checks[evalIndex] ? checks[evalIndex](text) : {}),
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
