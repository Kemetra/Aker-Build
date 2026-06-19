import type { Finding } from "./types.js";

/** A finding's collapsed confidence tier (P2). */
export type ConfidenceTier = "confirmed" | "suspected";

/**
 * Collapse a finding's evidence confidences into a tier (P2 Decision 1, max rule):
 * `confirmed` iff at least one evidence item is `high` (a structural proof dominates);
 * otherwise `suspected`. Empty evidence → `suspected` (no proof). Pure; no side effects.
 */
export function confidenceTier(finding: Finding): ConfidenceTier {
  return finding.evidence.some((e) => e.confidence === "high") ? "confirmed" : "suspected";
}
