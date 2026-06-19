import type { TenantGuardConfig } from "@tenantguard/config";
import type { Finding, RiskList, SuppressionMetadata } from "./types.js";
import { validateRisks } from "./schema.js";
import { InvalidRisksError } from "./run.js";
import { confidenceTier } from "./confidence.js";

export function applyConfigToRisks(risks: RiskList, config: TenantGuardConfig): RiskList {
  const findings = risks.findings.map((finding) => applyGateConfig(finding, config));
  const next: RiskList = { ...risks, findings };
  const result = validateRisks(next);
  if (!result.ok) {
    throw new InvalidRisksError(
      `configured risks.json failed schema validation: ${result.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ")}`,
    );
  }
  return next;
}

export function findingId(finding: Finding): string {
  const first = finding.evidence[0];
  return [finding.gate_id, first?.path ?? "", first?.signal ?? "", finding.status].join(":");
}

function applyGateConfig(finding: Finding, config: TenantGuardConfig): Finding {
  const gateConfig = config.gates?.[finding.gate_id];
  if (!gateConfig) return finding;

  let next = finding;
  if (next.status === "risk" && gateConfig.severity) {
    next = { ...next, severity: gateConfig.severity };
  }

  // P2: per-gate min_tier. A finding below the threshold is suppressed with an AUDITED record
  // (never silently dropped) so it remains visible in output, marked why. Only `confirmed` is a
  // meaningful floor (everything is >= suspected); applies to risk/needs_verification findings.
  if (gateConfig.min_tier === "confirmed" && confidenceTier(next) === "suspected" && !next.suppression) {
    const tierSuppression: SuppressionMetadata = {
      id: `min-tier:${next.gate_id}`,
      reason: `below gate min_tier=confirmed (finding tier=suspected)`,
      owner: "tenantguard:config",
      matched_by: "finding_id",
    };
    next = { ...next, suppression: tierSuppression } as Finding;
    return next;
  }

  const suppression = gateConfig.suppressions?.find((candidate) => matchesSuppression(next, candidate));
  if (!suppression) return next;

  const metadata: SuppressionMetadata = {
    id: suppression.id,
    reason: suppression.reason,
    owner: suppression.owner,
    ...(suppression.expires ? { expires: suppression.expires } : {}),
    matched_by: suppression.finding_id === findingId(next) ? "finding_id" : "path",
  };
  return { ...next, suppression: metadata } as Finding;
}

function matchesSuppression(
  finding: Finding,
  suppression: NonNullable<NonNullable<TenantGuardConfig["gates"]>[string]["suppressions"]>[number],
): boolean {
  if (suppression.finding_id && suppression.finding_id === findingId(finding)) return true;
  if (!suppression.path) return false;
  return finding.evidence.some((e) => e.path != null && matchesPattern(e.path, suppression.path!));
}

function matchesPattern(path: string, pattern: string): boolean {
  const normalizedPath = path.replace(/\\/g, "/");
  const normalizedPattern = pattern.replace(/\\/g, "/");
  if (normalizedPath === normalizedPattern) return true;
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (!normalizedPattern.includes("*")) return false;
  return globToRegex(normalizedPattern).test(normalizedPath);
}

function globToRegex(pattern: string): RegExp {
  let source = "";
  for (let i = 0; i < pattern.length; i += 1) {
    const char = pattern[i]!;
    if (char === "*") {
      if (pattern[i + 1] === "*") {
        source += ".*";
        i += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    source += char.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`);
}
