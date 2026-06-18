import type { Finding, GateContext, Gate } from "../types.js";
import { risk, lineEvidence, notApplicable, read, matchingLines } from "./helpers.js";

const ID = "TG-G3";

const MIGRATION_FILE = /(^|\/)(migrations?|migrate)\/.+\.(sql|ts|js)$/i;
const DESTRUCTIVE = /\b(DROP\s+(TABLE|COLUMN)|DELETE\s+FROM|TRUNCATE)\b/i;
const NOT_NULL_NO_DEFAULT = /\bADD\s+COLUMN\b[^;]*\bNOT\s+NULL\b(?![^;]*\bDEFAULT\b)/i;

/**
 * Migration Safety Gate — flags destructive migrations and non-null-without-default columns.
 * Inspects files under migrations/ only. No migration surface → not_applicable.
 */
function run(ctx: GateContext): Finding[] {
  const migrationFiles = ctx.listFiles(ctx.repoRoot).filter((f) => MIGRATION_FILE.test(f));
  if (migrationFiles.length === 0) return [notApplicable(ID)];

  const findings: Finding[] = [];
  for (const file of migrationFiles) {
    const content = read(ctx, file);
    if (!content) continue;
    for (const line of matchingLines(content, DESTRUCTIVE)) {
      findings.push(
        risk(ID, "high", [lineEvidence(file, line, "destructive migration (drop/delete/truncate)", "high")]),
      );
    }
    for (const line of matchingLines(content, NOT_NULL_NO_DEFAULT)) {
      findings.push(
        risk(ID, "medium", [lineEvidence(file, line, "non-null column added without a default", "medium")]),
      );
    }
  }
  // Migrations exist but none risky → the gate cleanly applies with no findings.
  return findings;
}

export const g3Migration: Gate = {
  id: ID,
  name: "Migration Safety Gate",
  purpose: "Detect risky DB changes.",
  run,
};
