import type { Finding, GateContext, Gate } from "../types.js";
import { needsVerification, notApplicable, fileEvidence, missingEvidence, sourceFiles, readCode } from "./helpers.js";

const ID = "TG-G2";

const ROUTE_DEF = /\b(app|router|server)\.(get|post|put|patch|delete)\s*\(/i;
const OPENAPI = /(openapi|swagger)\.(ya?ml|json)$/i;

/**
 * Contract/API Gate — detects API contract drift. v0 has no diff evidence wired (diff-dependent
 * coverage matures with 007), so when API routes exist but no OpenAPI artifact is present, the
 * gate reports `needs_verification` (FR-004) rather than asserting drift. No API surface at all →
 * not_applicable.
 */
function run(ctx: GateContext): Finding[] {
  const files = ctx.listFiles(ctx.repoRoot);
  const hasOpenApi = files.some((f) => OPENAPI.test(f));
  const hasRoutes = sourceFiles(ctx).some((f) => ROUTE_DEF.test(readCode(ctx, f)));

  if (!hasRoutes) return [notApplicable(ID)];

  if (!hasOpenApi) {
    return [
      needsVerification(ID, [
        missingEvidence(null, "API routes present but no OpenAPI artifact; contract drift unverifiable without diff", "low"),
      ]),
    ];
  }
  // Routes + an OpenAPI artifact exist; without diff evidence we cannot assert drift in v0.
  const openApiFile = files.find((f) => OPENAPI.test(f));
  return [
    needsVerification(ID, [
      openApiFile
        ? fileEvidence(openApiFile, "OpenAPI present; drift check needs diff evidence (007)", "low")
        : missingEvidence(null, "OpenAPI present; drift check needs diff evidence (007)", "low"),
    ]),
  ];
}

export const g2Contract: Gate = {
  id: ID,
  name: "Contract/API Gate",
  purpose: "Detect API contract drift.",
  run,
};
