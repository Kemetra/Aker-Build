import type { Finding, GateContext, Gate } from "../types.js";
import { risk, lineEvidence, notApplicable, sourceFiles, readCode, matchingLines } from "./helpers.js";

const ID = "TG-G7";

// A background job / consumer.
const JOB = /(^|\/)(jobs?|workers?|consumers?|tasks?)\//i;
// Structured logging present.
const STRUCTURED_LOG = /\b(logger|log)\.(info|warn|error|debug)\s*\(/i;
// A critical mutation (write/delete) call.
const MUTATION = /\b(save|create|update|delete|insert|remove)\s*\(/i;
// An audit event near a mutation.
const AUDIT = /\b(audit|auditLog|recordAudit|emitAudit|auditEvent)\b/i;

/**
 * Observability Gate — flags background jobs without structured logging. If there are no source
 * files at all, the gate is not_applicable.
 */
function run(ctx: GateContext): Finding[] {
  const files = sourceFiles(ctx);
  if (files.length === 0) return [notApplicable(ID)];

  const findings: Finding[] = [];
  for (const file of files) {
    const content = readCode(ctx, file);
    if (!content.trim()) continue;
    if (JOB.test(file) && !STRUCTURED_LOG.test(content)) {
      findings.push(
        risk(ID, "low", [lineEvidence(file, 1, "background job without structured logs", "low")]),
      );
    }
    if (MUTATION.test(content) && !AUDIT.test(content) && /(^|\/)(admin|critical)/i.test(file)) {
      const line = matchingLines(content, MUTATION)[0] ?? 1;
      findings.push(
        risk(ID, "low", [lineEvidence(file, line, "critical mutation without an audit event", "low")]),
      );
    }
  }
  return findings;
}

export const g7Observability: Gate = {
  id: ID,
  name: "Observability Gate",
  purpose: "Detect missing operational signals.",
  run,
};
