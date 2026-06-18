import { writeOutput } from "@tenantguard/scanner";
import type { RiskList } from "./types.js";

/** Canonical risks.json filename. */
export const RISKS_FILENAME = "risks.json";

/**
 * Write the RiskList to `<outDir>/risks.json` (outside the scanned repo's tracked source, FR-014).
 * Delegates the actual write to the scanner's audited `writeOutput`. Returns the written path.
 */
export function writeRisks(outDir: string, risks: RiskList): string {
  return writeOutput(outDir, RISKS_FILENAME, JSON.stringify(risks, null, 2));
}
