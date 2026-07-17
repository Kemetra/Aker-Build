import { confidenceTier } from "@aker-build/gates";
import type { AttributableFinding } from "./attribute.js";
import type { ComparedGateFinding, Verdict, ScopeResult } from "./types.js";

/**
 * Derive the verdict (FR-012, data-model R3 + P2 calibration). The verdict is status-driven over
 * the diff-attributable findings + scope result, but only **confirmed** risks block (P2): a
 * `suspected` risk (no high-confidence evidence) is reported as advisory and never flips the
 * verdict — you may only block on findings whose precision is structural.
 *   - any `confirmed` `risk` finding OR any scope violation → not_ready
 *   - else any `risk`/`needs_verification` finding          → needs_verification (advisory surfaced)
 *   - else                                                  → ready
 * `severity` is reporting detail only. Handles `scope.checked === false` so US1 stands alone.
 */
export function decideVerdict(
  findings: readonly AttributableFinding[],
  scope: ScopeResult,
): Verdict {
  const activeFindings = findings.filter((f) => !f.suppression);
  const hasConfirmedRisk = activeFindings.some(
    (f) => f.status === "risk" && confidenceTier(f) === "confirmed",
  );
  const hasScopeViolation = scope.violations.length > 0;
  if (hasConfirmedRisk || hasScopeViolation) return "not_ready";

  // A suspected (not-confirmed) risk is not proven enough to block, but it is not "clean" either —
  // surface it as needs_verification rather than a false "ready".
  const hasSuspectedRisk = activeFindings.some((f) => f.status === "risk");
  const hasNeedsVerification = activeFindings.some((f) => f.status === "needs_verification");
  if (hasSuspectedRisk || hasNeedsVerification) return "needs_verification";

  return "ready";
}

/**
 * v2 verdict: existing debt and positive changes remain visible but cannot block the change.
 * Incompleteness and unattributed head findings are always explicit uncertainty.
 */
export function decideComparisonVerdict(
  findings: readonly ComparedGateFinding[],
  scope: ScopeResult,
  comparisonComplete: boolean,
): Verdict {
  if (scope.violations.length > 0) return "not_ready";

  const contributing = findings.filter((finding) =>
    finding.classification === "new"
    || (finding.classification === "changed" && finding.change === "worsened"),
  );
  const active = contributing.filter((finding) => !finding.suppression);
  const confirmedRisk = active.some(
    (finding) => finding.status === "risk" && confidenceTier(finding) === "confirmed",
  );
  const uncertainFinding = active.some((finding) =>
    finding.status === "risk" || finding.status === "needs_verification",
  );
  const unattributed = findings.some((finding) => finding.classification === "unattributed");

  // Incompleteness always forces needs_verification (never ready) — a confirmed risk found on an
  // incomplete comparison may be an artifact of the missing base/head/diff data, so only a complete
  // comparison may promote it to not_ready. Scope violations are the sole exception (handled above).
  if (!comparisonComplete) return "needs_verification";
  if (confirmedRisk) return "not_ready";
  if (unattributed || uncertainFinding) return "needs_verification";

  return "ready";
}
