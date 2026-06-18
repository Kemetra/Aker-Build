import type { Finding, GateContext, Gate } from "../types.js";
import { needsVerification, missingEvidence } from "./helpers.js";

const ID = "TG-G9";

const CI_CONFIG = /(^|\/)(\.github\/workflows\/.+\.ya?ml|\.gitlab-ci\.yml|\.circleci\/config\.yml|azure-pipelines\.yml)$/i;

/**
 * Release Readiness Gate — release blockers (critical gates failing, CI failing, no rollback note)
 * are partly cross-gate and partly CI-state, which v0 cannot fully observe locally. Base signal: if
 * no CI configuration exists, readiness is unverifiable → needs_verification. The orchestrator
 * (run.ts) additionally injects a `risk` finding here when any critical-severity finding exists
 * across the run (R: aggregation), so G9 reflects the run's overall blocker state.
 */
function run(ctx: GateContext): Finding[] {
  const hasCi = ctx.listFiles(ctx.repoRoot).some((f) => CI_CONFIG.test(f));
  if (!hasCi) {
    return [
      needsVerification(ID, [
        missingEvidence(null, "no CI configuration found; release readiness unverifiable", "low"),
      ]),
    ];
  }
  return [
    needsVerification(ID, [
      missingEvidence(null, "CI present; live CI/rollback status needs PR evidence (007)", "low"),
    ]),
  ];
}

export const g9Release: Gate = {
  id: ID,
  name: "Release Readiness Gate",
  purpose: "Detect release blockers.",
  run,
};
