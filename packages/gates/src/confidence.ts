import type { Evidence } from "@aker-build/project-map";

/** A finding's collapsed confidence tier (P2). */
export type ConfidenceTier = "confirmed" | "suspected";

/**
 * Collapse a finding's evidence confidences into a tier (P2 Decision 1, max rule):
 * `confirmed` iff at least one evidence item is `high` (a structural proof dominates);
 * otherwise `suspected`. Empty evidence → `suspected` (no proof). Pure; no side effects.
 *
 * Accepts the minimal structural shape it actually reads (`{ evidence }`) rather than the full
 * `Finding`, so any finding-like value — a gates `Finding`, a review `ReviewFinding` gate arm, an
 * `AttributableFinding` — passes without a cast. (`confidenceTier` only ever inspects evidence.)
 */
export function confidenceTier(finding: { evidence: readonly Evidence[] }): ConfidenceTier {
  return finding.evidence.some((e) => e.confidence === "high") ? "confirmed" : "suspected";
}
