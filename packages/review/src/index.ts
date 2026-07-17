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
} from "./types.js";
