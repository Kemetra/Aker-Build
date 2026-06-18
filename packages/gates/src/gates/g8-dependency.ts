import type { Finding, GateContext, Gate } from "../types.js";
import { needsVerification, notApplicable, fileEvidence, missingEvidence } from "./helpers.js";

const ID = "TG-G8";

const LOCKFILE = /(^|\/)(pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/i;
const MANIFEST = /(^|\/)package\.json$/i;

/**
 * Dependency/Upgrade Gate — dependency-drift checks are diff-dependent (lockfile change, major
 * upgrade) and mature with 007. v0: if a manifest exists but no lockfile, report needs_verification
 * (drift unverifiable); if neither exists, not_applicable.
 */
function run(ctx: GateContext): Finding[] {
  const files = ctx.listFiles(ctx.repoRoot);
  const hasManifest = files.some((f) => MANIFEST.test(f));
  const lockfile = files.find((f) => LOCKFILE.test(f));

  if (!hasManifest) return [notApplicable(ID)];

  if (!lockfile) {
    return [
      needsVerification(ID, [
        missingEvidence(null, "manifest present but no lockfile; dependency drift unverifiable", "low"),
      ]),
    ];
  }
  return [
    needsVerification(ID, [
      fileEvidence(lockfile, "lockfile present; upgrade-drift check needs diff evidence (007)", "low"),
    ]),
  ];
}

export const g8Dependency: Gate = {
  id: ID,
  name: "Dependency/Upgrade Gate",
  purpose: "Detect dependency risks.",
  run,
};
