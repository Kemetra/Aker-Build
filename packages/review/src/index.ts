// Public surface for @aker-build/review.
// PR Reviewer — review a local diff (or GitHub PR) against the 004 gates + declared scope,
// returning a Ready / Not Ready / Needs Verification verdict with evidence (007).

export { reviewLocalDiff, assemble, excludeOutDir } from "./review.js";
export type { ReviewDeps } from "./review.js";
export { reviewPr } from "./pr.js";
export type { PrReviewDeps } from "./pr.js";
export { renderReport } from "./render.js";
export { renderChecksPayload } from "./checks.js";
export type { ChecksPayload, CheckAnnotation } from "./checks.js";
export { changedFiles, GitUnavailableError } from "./git.js";
export { prChangedFiles, prMetadata, GitHubUnavailableError } from "./gh.js";
export { checkScope, SCOPE_SKIPPED } from "./scope.js";
export { decideVerdict } from "./verdict.js";
export { decideComparisonVerdict } from "./verdict.js";
export { compareReview, assembleIncompleteReview } from "./compare-review.js";
export type { CompareReviewInput, CompareReviewDeps, IncompleteReviewInput } from "./compare-review.js";
export { classifyFindings, findingFingerprint } from "./comparison.js";
export type { ClassificationInput, SourceReader } from "./comparison.js";
export { diffTrees, parseNoIndexDiff, isLineChanged } from "./diff.js";
export type { TreeDiffResult, DiffRunResult, DiffRunner } from "./diff.js";
export { createLocalSnapshots, createRefSnapshots, createCheckoutSnapshots } from "./snapshot.js";
export type { SnapshotPairResult, SnapshotPairSuccess, SnapshotPairFailure } from "./snapshot.js";
export { attributable, diffAttributableFindings } from "./attribute.js";
export {
  loadQueueItem,
  writeReview,
  assertValidReport,
  MissingQueueError,
  UnknownItemError,
  InvalidReviewError,
} from "./io.js";
export {
  reviewSchema,
  reviewFindingSchema,
  validateReview,
  REVIEW_SCHEMA_VERSION,
} from "./schema.js";
export type {
  ReviewMode,
  Verdict,
  ReviewFinding,
  ScopeViolation,
  ScopeViolationReason,
  ScopeResult,
  ReviewReport,
  ReviewOptions,
  Evidence,
  Finding,
  Severity,
  FindingStatus,
  ScopeFinding,
  FindingClassification,
  FindingChange,
  ComparisonIncompleteReason,
  ChangedLineRange,
  ChangedFileRanges,
  FindingComparison,
  ComparedGateFinding,
  ReviewFindingV2,
  ComparisonRef,
  ComparisonCounts,
  ReviewComparison,
  ReviewReportV1,
  ReviewReportV2,
  AnyReviewReport,
} from "./types.js";
