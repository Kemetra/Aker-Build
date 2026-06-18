import type { Finding, GateContext, Gate } from "../types.js";
import { risk, fileEvidence, lineEvidence, sourceFiles, readCode, matchingLines } from "./helpers.js";

const ID = "TG-G1";

// A frontend file importing a backend internal path (boundary violation).
const FRONTEND_DIR = /(^|\/)(web|frontend|app|ui|client)\//i;
const BACKEND_IMPORT = /import[^;]*from\s+['"][^'"]*(\/|^)(backend|server|api\/internal|db|database)(\/|['"])/i;
// A worker file exposing an HTTP route (workers shouldn't serve public HTTP).
const WORKER_DIR = /(^|\/)(worker|workers|jobs|queue)\//i;
const HTTP_ROUTE = /\b(app|router|server)\.(get|post|put|patch|delete)\s*\(/i;

/**
 * Architecture Boundary Gate — detects cross-boundary violations via import/usage heuristics.
 * Findings carry line evidence at the offending import/route.
 */
function run(ctx: GateContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of sourceFiles(ctx)) {
    const content = readCode(ctx, file);
    if (!content.trim()) continue;

    if (FRONTEND_DIR.test(file)) {
      for (const line of matchingLines(content, BACKEND_IMPORT)) {
        findings.push(
          risk(ID, "high", [
            lineEvidence(file, line, "frontend imports backend internals", "high"),
          ]),
        );
      }
    }
    if (WORKER_DIR.test(file) && HTTP_ROUTE.test(content)) {
      const line = matchingLines(content, HTTP_ROUTE)[0] ?? null;
      findings.push(
        risk(ID, "medium", [
          line !== null
            ? lineEvidence(file, line, "worker exposes public HTTP route", "medium")
            : fileEvidence(file, "worker exposes public HTTP route", "medium"),
        ]),
      );
    }
  }
  return findings;
}

export const g1Architecture: Gate = {
  id: ID,
  name: "Architecture Boundary Gate",
  purpose: "Detect boundary violations between layers.",
  run,
};
