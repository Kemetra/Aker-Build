import type { AttributableFinding } from "./attribute.js";
import type { Verdict, ScopeResult } from "./types.js";

/**
 * Derive the verdict off finding `status` (FR-012, data-model R3). 004 ships no "blocking gate"
 * field, so the verdict is purely status-driven over the diff-attributable findings + scope result:
 *   - any `risk` finding OR any scope violation  → not_ready  (all risks block in v0)
 *   - else any `needs_verification` finding       → needs_verification
 *   - else                                        → ready
 * `severity` is reporting detail only. Handles `scope.checked === false` so US1 (no scope) stands
 * alone as the MVP.
 */
export function decideVerdict(
  findings: readonly AttributableFinding[],
  scope: ScopeResult,
): Verdict {
  const activeFindings = findings.filter((f) => !f.suppression);
  const hasRisk = activeFindings.some((f) => f.status === "risk");
  const hasScopeViolation = scope.violations.length > 0;
  if (hasRisk || hasScopeViolation) return "not_ready";

  const hasNeedsVerification = activeFindings.some((f) => f.status === "needs_verification");
  if (hasNeedsVerification) return "needs_verification";

  return "ready";
}
