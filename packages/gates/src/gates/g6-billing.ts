import type { Finding, GateContext, Gate } from "../types.js";
import { risk, lineEvidence, notApplicable, sourceFiles, readCode, matchingLines } from "./helpers.js";

const ID = "TG-G6";

// A billing/usage surface.
const BILLING_SURFACE = /\b(billing|subscription|usage|invoice|stripe|plan[_-]?limit|metered)\b/i;
// A usage event emission.
const USAGE_EVENT = /\b(recordUsage|trackUsage|emitUsage|usageEvent|reportUsage)\s*\(/i;
// A tenant/account id near the usage call.
const TENANT_ID = /\b(tenant_id|tenantId|account_id|accountId|org_id|orgId)\b/i;

/**
 * Billing/Usage Gate — flags usage events emitted without a tenant/account id. If the repo has no
 * billing surface at all, the gate is not_applicable (FR-005).
 */
function run(ctx: GateContext): Finding[] {
  const files = sourceFiles(ctx);
  const hasBillingSurface = files.some((f) => BILLING_SURFACE.test(f) || BILLING_SURFACE.test(readCode(ctx, f)));
  if (!hasBillingSurface) return [notApplicable(ID)];

  const findings: Finding[] = [];
  for (const file of files) {
    const content = readCode(ctx, file);
    if (!content.trim()) continue;
    for (const line of matchingLines(content, USAGE_EVENT)) {
      const lineText = content.split(/\r?\n/)[line - 1] ?? "";
      if (!TENANT_ID.test(lineText)) {
        findings.push(
          risk(ID, "medium", [lineEvidence(file, line, "usage event without a tenant/account id", "medium")]),
        );
      }
    }
  }
  return findings;
}

export const g6Billing: Gate = {
  id: ID,
  name: "Billing/Usage Gate",
  purpose: "Detect billing-sensitive issues.",
  run,
};
