import type { Evidence } from "@tenantguard/project-map";
import type { Finding, Severity, FindingStatus } from "@tenantguard/gates";

// 002/004 shapes are reused VERBATIM — never redefined here.
export type { Evidence, Finding, Severity, FindingStatus };

/** Which input the review evaluated. */
export type ReviewMode = "local-diff" | "pr";

/** The three-valued readiness verdict (FR-001). */
export type Verdict = "ready" | "not_ready" | "needs_verification";

/** Why a changed file is out of the declared scope (FR-003). */
export type ScopeViolationReason = "forbidden" | "outside_allowed";

/** One out-of-scope changed file, relative to a queue item's declared scope. */
export interface ScopeViolation {
  file: string;
  reason: ScopeViolationReason;
}

/** Result of the optional `--item` scope check. `checked: false` when no item was given (FR-003). */
export interface ScopeResult {
  checked: boolean;
  item_id?: string;
  violations: ScopeViolation[];
}

/**
 * A contributing finding in a review. Either a diff-attributable 004 gate finding (surfaced verbatim,
 * never `not_applicable`) or a scope violation. Discriminated by the presence of `kind`.
 */
export type ReviewFinding =
  | { gate_id: string; status: Exclude<FindingStatus, "not_applicable">; severity: Severity | null; evidence: Evidence[] }
  | { kind: "scope"; file: string; reason: ScopeViolationReason; item_id: string };

/** PR metadata surfaced as context/evidence in PR mode (FR-005). Absent for local-diff. */
export interface PrMetadata {
  number: number;
  title: string;
  state: string;
  base_ref: string;
}

/** The machine-readable review report (review.json). */
export interface ReviewReport {
  schema_version: number;
  mode: ReviewMode;
  verdict: Verdict;
  changed_files: string[];
  findings: ReviewFinding[];
  scope: ScopeResult;
  /** PR mode only: was GitHub access available? `null` for local-diff. */
  github_available: boolean | null;
  /** PR mode only: the PR's metadata, used as evidence alongside changed files (FR-005). */
  pr?: PrMetadata;
}

export interface ReviewOptions {
  /** Out-dir holding queue.json/project-map.json input and where review.json/review.md are written. */
  out?: string;
  /** Optional queue item id; when set, scope is checked against its allowed/forbidden files. */
  item?: string;
  /** Optional explicit config path. If omitted, tenantguard.config.json/yaml is auto-discovered. */
  configPath?: string;
}
