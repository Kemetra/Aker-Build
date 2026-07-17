import type { Evidence } from "@aker-build/project-map";
import type { Finding, Severity, FindingStatus } from "@aker-build/gates";

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

/** A scope finding is shared by both report schema versions. */
export interface ScopeFinding {
  kind: "scope";
  file: string;
  reason: ScopeViolationReason;
  item_id: string;
}

/**
 * A contributing finding in a review. Either a diff-attributable 004 gate finding (surfaced verbatim,
 * never `not_applicable`) or a scope violation. Discriminated by the presence of `kind`.
 */
export type ReviewFinding =
  | { gate_id: string; status: Exclude<FindingStatus, "not_applicable">; severity: Severity | null; evidence: Evidence[] }
  | ScopeFinding;

/** How a finding relates to the comparison base. */
export type FindingClassification = "new" | "existing" | "resolved" | "changed" | "unattributed";

/** Direction of a material change to a paired finding. */
export type FindingChange = "worsened" | "improved" | "modified";

/** Closed reasons why a base/head comparison could not be completed safely. */
export type ComparisonIncompleteReason =
  | "base_unavailable"
  | "head_unavailable"
  | "diff_unavailable"
  | "unsafe_path"
  | "submodule_unsupported"
  | "lfs_unsupported";

/** Inclusive changed line interval in the head snapshot. */
export interface ChangedLineRange {
  start: number;
  end: number;
}

/** Changed-line metadata for one normalized repository-relative path. */
export interface ChangedFileRanges {
  path: string;
  ranges: ChangedLineRange[];
  binary: boolean;
}

/** Comparison metadata attached to every v2 gate finding. */
export interface FindingComparison {
  classification: FindingClassification;
  fingerprint: string;
  source: "base" | "head";
  line_changed: boolean;
  change?: FindingChange;
}

export type ComparedGateFinding = Finding & FindingComparison;
export type ReviewFindingV2 = ComparedGateFinding | ScopeFinding;

export interface ComparisonRef {
  label: string;
  sha: string | null;
}

export type ComparisonCounts = Record<FindingClassification, number>;

export interface ReviewComparison {
  base: ComparisonRef;
  head: ComparisonRef;
  complete: boolean;
  incomplete_reasons: ComparisonIncompleteReason[];
  counts: ComparisonCounts;
}

/** PR metadata surfaced as context/evidence in PR mode (FR-005). Absent for local-diff. */
export interface PrMetadata {
  number: number;
  title: string;
  state: string;
  base_ref: string;
}

/** The machine-readable review report (review.json). */
export interface ReviewReport {
  schema_version: 1;
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

/** Frozen legacy report shape accepted for migration and aggregate rendering. */
export interface ReviewReportV1 extends Omit<ReviewReport, "schema_version"> {
  schema_version: 1;
}

/** Sole shape produced by the diff-aware review engine. */
export interface ReviewReportV2 extends Omit<ReviewReport, "schema_version" | "findings"> {
  schema_version: 2;
  changed_ranges: ChangedFileRanges[];
  findings: ReviewFindingV2[];
  comparison: ReviewComparison;
}

export type AnyReviewReport = ReviewReportV1 | ReviewReportV2;

export interface ReviewOptions {
  /** Out-dir holding queue.json/project-map.json input and where review.json/review.md are written. */
  out?: string;
  /** Optional queue item id; when set, scope is checked against its allowed/forbidden files. */
  item?: string;
  /** Optional explicit config path. If omitted, aker-build.config.json/yaml is auto-discovered. */
  configPath?: string;
  /** Local mode only: explicit commit-ish to compare against instead of HEAD. */
  base?: string;
}
