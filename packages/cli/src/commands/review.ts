import { stringify as toYaml } from "yaml";
import { ConfigError } from "@tenantguard/config";
import { isGitRepo } from "@tenantguard/scanner";
import { MissingProjectMapError, NotGitRepoError, InvalidProjectMapError } from "@tenantguard/gates";
import {
  reviewLocalDiff,
  reviewPr,
  renderReport,
  writeReview,
  assertValidReport,
  MissingQueueError,
  UnknownItemError,
  InvalidReviewError,
  GitUnavailableError,
  GitHubUnavailableError,
} from "@tenantguard/review";
import type { ReviewReport } from "@tenantguard/review";

export interface ReviewCmdOptions {
  localDiff?: boolean;
  item?: string;
  config?: string;
  out?: string;
  stdout?: boolean;
  format?: "json" | "yaml";
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
  /** Injectable PR-source deps (default-real); used to test gh-unavailable degradation. */
  prDeps?: {
    prChangedFiles?: (prNumber: number) => string[];
    prMetadata?: (prNumber: number) => { title: string; state: string; baseRefName: string };
  };
}

const DEFAULT_OUT = ".tenantguard";

/**
 * Run the `review-pr` command. Returns an exit code (no process.exit, so it is testable).
 * The verdict is independent of the exit code: a Not-Ready verdict is still a successful review
 * (exit 0). Exit codes:
 *   0 = review completed (a verdict was produced)
 *   1 = required upstream input missing (no project-map.json → run scan; or --item but no queue.json)
 *   2 = bad input (not a Git repo, neither --local-diff nor a PR number, unknown --item id, gh unavailable)
 *   3 = internal error (assembled review.json failed its own schema)
 */
export function runReviewCommand(
  arg: string | undefined,
  opts: ReviewCmdOptions = {},
): number {
  const out = opts.out ?? DEFAULT_OUT;
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));

  // arg is the target path (local-diff) or — in PR mode (US2) — a PR number. For US1, --local-diff
  // is required and arg defaults to ".".
  const prNumber = !opts.localDiff && arg && /^\d+$/.test(arg) ? arg : undefined;
  if (!opts.localDiff && !prNumber) {
    printErr("Specify --local-diff to review the working diff, or a PR number to review a GitHub PR.");
    return 2;
  }

  try {
    let report: ReviewReport;
    if (prNumber) {
      report = reviewPr(Number(prNumber), { out, item: opts.item, configPath: opts.config }, { ...opts.prDeps, repoRoot: "." });
    } else {
      const targetPath = arg ?? ".";
      if (!isGitRepo(targetPath)) {
        printErr(`Not a Git repository: ${targetPath}`);
        return 2;
      }
      report = reviewLocalDiff({ out, item: opts.item, configPath: opts.config }, { repoRoot: targetPath });
    }
    assertValidReport(report);
    const markdown = renderReport(report);

    if (opts.stdout) {
      print(markdown);
      print(opts.format === "yaml" ? toYaml(report) : JSON.stringify(report, null, 2));
      return 0;
    }

    const { jsonPath, mdPath } = writeReview(out, report, markdown);
    printErr(`Wrote ${jsonPath}`);
    printErr(`Wrote ${mdPath}`);
    print(markdown);
    printErr(`Verdict: ${report.verdict}`);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printErr(msg);
    if (err instanceof MissingProjectMapError) return 1;
    if (err instanceof MissingQueueError) return 1;
    if (err instanceof NotGitRepoError) return 2;
    if (err instanceof UnknownItemError) return 2;
    if (err instanceof GitUnavailableError) return 2;
    if (err instanceof GitHubUnavailableError) return 2;
    if (err instanceof ConfigError) return 2;
    if (err instanceof InvalidProjectMapError) return 3;
    if (err instanceof InvalidReviewError) return 3;
    return 3;
  }
}
