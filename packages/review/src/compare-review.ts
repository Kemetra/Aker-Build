import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { runGates, type Finding } from "@aker-build/gates";
import { scanToFile } from "@aker-build/scanner";
import { classifyFindings } from "./comparison.js";
import { diffTrees, isLineChanged, type TreeDiffResult } from "./diff.js";
import { REVIEW_SCHEMA_VERSION } from "./schema.js";
import { decideComparisonVerdict } from "./verdict.js";
import type {
  ComparisonCounts,
  ComparisonIncompleteReason,
  ComparisonRef,
  PrMetadata,
  ReviewMode,
  ReviewReportV2,
  ScopeFinding,
  ScopeResult,
} from "./types.js";

const ANALYSIS_PREFIX = "aker-review-analysis-";
const REASON_ORDER: readonly ComparisonIncompleteReason[] = [
  "base_unavailable",
  "head_unavailable",
  "diff_unavailable",
  "unsafe_path",
  "submodule_unsupported",
  "lfs_unsupported",
];

export interface CompareReviewInput {
  mode: ReviewMode;
  baseRoot: string;
  headRoot: string;
  base: ComparisonRef;
  head: ComparisonRef;
  scope: ScopeResult;
  githubAvailable: boolean | null;
  pr?: PrMetadata;
  configPath?: string;
  incompleteReasons?: readonly ComparisonIncompleteReason[];
}

export interface CompareReviewDeps {
  analyze?: (treeRoot: string, analysisOut: string, configPath?: string) => readonly Finding[];
  diff?: (baseRoot: string, headRoot: string) => TreeDiffResult;
}

export interface IncompleteReviewInput {
  mode: ReviewMode;
  base: ComparisonRef;
  head: ComparisonRef;
  scope: ScopeResult;
  githubAvailable: boolean | null;
  incompleteReasons: readonly ComparisonIncompleteReason[];
  changedFiles?: readonly string[];
  pr?: PrMetadata;
}

/** Shared CLI/Action/App engine: both sides are analyzed identically, then compared once. */
export function compareReview(
  input: CompareReviewInput,
  deps: CompareReviewDeps = {},
): ReviewReportV2 {
  const compareTrees = deps.diff ?? diffTrees;
  const analyze = deps.analyze ?? analyzeTree;
  const analysisRoot = mkdtempSync(join(tmpdir(), ANALYSIS_PREFIX));
  let treeDiff: TreeDiffResult;
  try {
    treeDiff = compareTrees(input.baseRoot, input.headRoot);
  } catch {
    treeDiff = { changedFiles: [], complete: false, incompleteReasons: ["diff_unavailable"] };
  }

  const reasons: ComparisonIncompleteReason[] = [
    ...(input.incompleteReasons ?? []),
    ...treeDiff.incompleteReasons,
  ];
  let baseFindings: readonly Finding[] = [];
  let headFindings: readonly Finding[] = [];
  try {
    try {
      baseFindings = analyze(input.baseRoot, join(analysisRoot, "base"), input.configPath);
    } catch (error) {
      if (isScanBudgetError(error)) throw error;
      reasons.push("base_unavailable");
    }
    try {
      headFindings = analyze(input.headRoot, join(analysisRoot, "head"), input.configPath);
    } catch (error) {
      if (isScanBudgetError(error)) throw error;
      reasons.push("head_unavailable");
    }

    const findings = classifyFindings({
      base: baseFindings,
      head: headFindings,
      baseRoot: input.baseRoot,
      headRoot: input.headRoot,
      lineChanged: (path, line) => isLineChanged(treeDiff.changedFiles, path, line),
    });
    const incompleteReasons = orderedReasons(reasons);
    const complete = incompleteReasons.length === 0 && treeDiff.complete;
    const counts = countClassifications(findings);
    const scopeFindings: ScopeFinding[] = input.scope.violations.map((violation) => ({
      kind: "scope",
      file: violation.file,
      reason: violation.reason,
      item_id: input.scope.item_id ?? "",
    }));

    return {
      schema_version: REVIEW_SCHEMA_VERSION,
      mode: input.mode,
      verdict: decideComparisonVerdict(findings, input.scope, complete),
      changed_files: treeDiff.changedFiles.map((file) => file.path),
      changed_ranges: treeDiff.changedFiles,
      findings: [...findings, ...scopeFindings],
      scope: input.scope,
      github_available: input.githubAvailable,
      comparison: {
        base: input.base,
        head: input.head,
        complete,
        incomplete_reasons: incompleteReasons,
        counts,
      },
      ...(input.pr ? { pr: input.pr } : {}),
    };
  } finally {
    disposeAnalysisRoot(analysisRoot);
  }
}

/** Produce a valid neutral v2 report when snapshots cannot safely be materialized. */
export function assembleIncompleteReview(input: IncompleteReviewInput): ReviewReportV2 {
  const incompleteReasons = orderedReasons(input.incompleteReasons);
  const counts: ComparisonCounts = { new: 0, existing: 0, resolved: 0, changed: 0, unattributed: 0 };
  const scopeFindings: ScopeFinding[] = input.scope.violations.map((violation) => ({
    kind: "scope",
    file: violation.file,
    reason: violation.reason,
    item_id: input.scope.item_id ?? "",
  }));
  return {
    schema_version: REVIEW_SCHEMA_VERSION,
    mode: input.mode,
    verdict: decideComparisonVerdict([], input.scope, false),
    changed_files: [...(input.changedFiles ?? [])],
    changed_ranges: [],
    findings: scopeFindings,
    scope: input.scope,
    github_available: input.githubAvailable,
    comparison: {
      base: input.base,
      head: input.head,
      complete: false,
      incomplete_reasons: incompleteReasons,
      counts,
    },
    ...(input.pr ? { pr: input.pr } : {}),
  };
}

function analyzeTree(treeRoot: string, analysisOut: string, configPath?: string): readonly Finding[] {
  // Scanner/gates currently require a Git marker. These are owned archive snapshots, so an empty
  // skipped marker preserves the existing scanner contract without touching a user repository.
  mkdirSync(join(treeRoot, ".git"), { recursive: true });
  scanToFile(treeRoot, analysisOut, { configPath });
  return runGates(treeRoot, { out: analysisOut, configPath }).risks.findings;
}

function countClassifications(
  findings: readonly { classification: keyof ComparisonCounts }[],
): ComparisonCounts {
  const counts: ComparisonCounts = { new: 0, existing: 0, resolved: 0, changed: 0, unattributed: 0 };
  for (const finding of findings) counts[finding.classification] += 1;
  return counts;
}

function orderedReasons(reasons: readonly ComparisonIncompleteReason[]): ComparisonIncompleteReason[] {
  const present = new Set(reasons);
  return REASON_ORDER.filter((reason) => present.has(reason));
}

function disposeAnalysisRoot(root: string): void {
  const ownedRoot = resolve(root);
  if (dirname(ownedRoot) !== resolve(tmpdir()) || !basename(ownedRoot).startsWith(ANALYSIS_PREFIX)) {
    throw new Error("refusing to remove a non-owned analysis root");
  }
  rmSync(ownedRoot, { recursive: true, force: true });
}

function isScanBudgetError(error: unknown): boolean {
  return error instanceof Error && error.name === "ScanBudgetExceededError";
}
