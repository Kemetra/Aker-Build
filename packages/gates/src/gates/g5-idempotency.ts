import type { Finding, GateContext, Gate } from "../types.js";
import { risk, lineEvidence, sourceFiles, readCode, matchingLines } from "./helpers.js";

const ID = "TG-G5";

// A webhook handler.
const WEBHOOK = /\bwebhook\b/i;
// Idempotency / signature protections.
const IDEMPOTENCY = /\b(idempotenc|signature|verifySignature|x-signature|dedupe|dedup|replay|nonce|idempotency[_-]?key)\b/i;
// A payment/charge action.
const PAYMENT = /\b(charge|capturePayment|createCharge|stripe\.\w+\.create|processPayment)\b/i;

/**
 * Idempotency Gate — flags webhook handlers and payment actions that lack idempotency/replay
 * protection (duplicate-work risk). File-level signal with line evidence.
 */
function run(ctx: GateContext): Finding[] {
  const findings: Finding[] = [];
  for (const file of sourceFiles(ctx)) {
    const content = readCode(ctx, file);
    if (!content.trim()) continue;
    const hasProtection = IDEMPOTENCY.test(content);

    if (WEBHOOK.test(content) && !hasProtection) {
      const line = matchingLines(content, WEBHOOK)[0] ?? 1;
      findings.push(
        risk(ID, "high", [
          lineEvidence(file, line, "webhook handler without signature/idempotency tracking", "medium"),
        ]),
      );
    }
    if (PAYMENT.test(content) && !hasProtection) {
      const line = matchingLines(content, PAYMENT)[0] ?? 1;
      findings.push(
        risk(ID, "high", [
          lineEvidence(file, line, "payment action without replay protection", "medium"),
        ]),
      );
    }
  }
  return findings;
}

export const g5Idempotency: Gate = {
  id: ID,
  name: "Idempotency Gate",
  purpose: "Detect mutation flows that can duplicate work.",
  run,
};
