// Public surface for @tenantguard/gates.
// SaaS Gates v0 — evidence-backed risk detection producing risks.json (004).

import { resolve } from "node:path";
import { loadConfig } from "@tenantguard/config";
import { buildContext } from "./context.js";
import { runGatesOnContext } from "./run.js";
import { writeRisks } from "./io.js";
import type { RunGatesOptions, RunGatesResult } from "./types.js";
import { applyConfigToRisks } from "./suppressions.js";

const DEFAULT_OUT = ".tenantguard";

/**
 * Run the v0 gate set (or a subset) over a scanned repo. Reads the produced project-map.json from
 * `out`, builds a read-only context, runs the gates, and returns the assembled RiskList. Read-only
 * on the scanned repo; does NOT write the file (use runGatesToFile for that).
 */
export function runGates(targetPath: string, opts: RunGatesOptions = {}): RunGatesResult {
  const out = opts.out ?? DEFAULT_OUT;
  const repoRoot = resolve(targetPath);
  const config = loadConfig(repoRoot, { configPath: opts.configPath }).config;
  const ctx = buildContext(repoRoot, out, config);
  const risks = applyConfigToRisks(runGatesOnContext(ctx, opts.gates), config);
  return { risks };
}

/** Run the gates and write risks.json to the designated out-dir. Returns the path + result. */
export function runGatesToFile(
  targetPath: string,
  opts: RunGatesOptions = {},
): { outPath: string; result: RunGatesResult } {
  const out = opts.out ?? DEFAULT_OUT;
  const result = runGates(targetPath, opts);
  const outPath = writeRisks(out, result.risks);
  return { outPath, result };
}

export { GATES, selectGates, UnknownGateError } from "./registry.js";
export { buildContext, MissingProjectMapError, NotGitRepoError, InvalidProjectMapError } from "./context.js";
export { runGatesOnContext, InvalidRisksError } from "./run.js";
export { findingSchema, risksSchema, validateRisks, RISKS_SCHEMA_VERSION, SEVERITIES } from "./schema.js";
export { applyConfigToRisks, findingId } from "./suppressions.js";
export { confidenceTier, type ConfidenceTier } from "./confidence.js";
export { ConfigError, ConfigSecretError, ConfigValidationError } from "@tenantguard/config";
export type { Finding, FindingStatus, Severity, Gate, GateContext, RiskList, RunGatesOptions, RunGatesResult, SuppressionMetadata } from "./types.js";
