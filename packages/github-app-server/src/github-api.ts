import type { ChecksPayload } from "@aker-build/github-app";

/**
 * The minimal GitHub surface this runtime needs, as a PORT. An operator supplies a concrete
 * octokit-backed adapter; tests supply a fake. Keeping it a narrow interface means the package is
 * fully testable without a network dependency, and the only GitHub operations that exist here are
 * the ones the report-only App is allowed to perform (Checks writes) plus the read calls the review
 * needs (changed files, PR metadata). There is deliberately NO method that mutates the repo.
 */
export interface GitHubApi {
  /** Read the PR's changed file paths (async — resolved by the server before handleEvent). */
  listChangedFiles(args: { owner: string; repo: string; prNumber: number }): Promise<string[]>;
  /** Read PR metadata surfaced as evidence. */
  getPrMetadata(args: {
    owner: string;
    repo: string;
    prNumber: number;
  }): Promise<{ title: string; state: string; baseRefName: string }>;
  /** Find an existing Aker Build check-run for the head (idempotency, 014 FR-012). */
  findCheckRun(args: { owner: string; repo: string; headSha: string }): Promise<{ id: number } | null>;
  /** Create a check-run + annotations. The ONLY write besides update. */
  createCheckRun(args: { owner: string; repo: string; headSha: string; payload: ChecksPayload }): Promise<{ id: number }>;
  /** Update an existing check-run. The ONLY other write. */
  updateCheckRun(args: { owner: string; repo: string; checkId: number; payload: ChecksPayload }): Promise<void>;
}
