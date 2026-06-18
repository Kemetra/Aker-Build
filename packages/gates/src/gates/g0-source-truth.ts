import type { Finding, GateContext, Gate } from "../types.js";
import { needsVerification, notApplicable, missingEvidence } from "./helpers.js";

const ID = "TG-G0";

/**
 * Source Truth Gate — verifies source evidence exists before any readiness claim. v0 signal:
 * the project map itself is the source-truth artifact; if the scanned repo carries no evidence
 * inputs at all (empty file list), there is nothing to assert from → needs_verification.
 */
function run(ctx: GateContext): Finding[] {
  const files = ctx.listFiles(ctx.repoRoot);
  if (files.length === 0) {
    return [
      needsVerification(ID, [
        missingEvidence(null, "no source files found to establish source truth", "low"),
      ]),
    ];
  }
  // Evidence is present (the map + files exist) — the gate has nothing to flag.
  return [notApplicable(ID)];
}

export const g0SourceTruth: Gate = {
  id: ID,
  name: "Source Truth Gate",
  purpose: "No claim before source evidence is read.",
  run,
};
