import type { Evidence, ProjectMap } from "@tenantguard/project-map";

/** Severity for a `risk` finding (ordered low→critical). Null for non-risk findings. */
export type Severity = "low" | "medium" | "high" | "critical";

/** A gate outcome status. */
export type FindingStatus = "risk" | "needs_verification" | "not_applicable";

/** Visible metadata for an explicitly suppressed finding. Suppressed findings remain in output. */
export interface SuppressionMetadata {
  id: string;
  reason: string;
  owner: string;
  expires?: string;
  matched_by: "path" | "finding_id";
}

/**
 * One gate outcome. Status-conditional shape (FR-003/FR-013, data-model):
 * - risk → severity (enum) + >=1 evidence
 * - needs_verification → severity null + >=1 evidence
 * - not_applicable → severity null + >=0 evidence
 * Evidence objects reuse the shared 002 shape verbatim (never redefined).
 */
export type Finding =
  | { gate_id: string; status: "risk"; severity: Severity; evidence: Evidence[]; suppression?: SuppressionMetadata }
  | { gate_id: string; status: "needs_verification"; severity: null; evidence: Evidence[]; suppression?: SuppressionMetadata }
  | { gate_id: string; status: "not_applicable"; severity: null; evidence: Evidence[]; suppression?: SuppressionMetadata };

/** The risks.json document. */
export interface RiskList {
  schema_version: number;
  findings: Finding[];
}

/**
 * Read-only context handed to every gate. Exposes the Project Map plus read-only file
 * primitives reused from @tenantguard/scanner — gates never mutate the scanned repo (FR-008).
 */
export interface GateContext {
  projectMap: ProjectMap;
  repoRoot: string;
  listFiles: (root: string) => string[];
  fileExists: (root: string, relPath: string) => boolean;
  readFileSafe: (root: string, relPath: string) => string | null;
}

/** A v0 gate: stable id, name, purpose, and a pure-ish run function. */
export interface Gate {
  id: string;
  name: string;
  purpose: string;
  run: (ctx: GateContext) => Finding[];
}

export interface RunGatesOptions {
  /** Output/input directory (outside scanned tracked source). Default ".tenantguard". */
  out?: string;
  /** Subset of gate ids to run; omitted/empty = full set. */
  gates?: string[];
  /** Optional explicit config path. If omitted, tenantguard.config.json/yaml is auto-discovered. */
  configPath?: string;
}

export interface RunGatesResult {
  risks: RiskList;
}
