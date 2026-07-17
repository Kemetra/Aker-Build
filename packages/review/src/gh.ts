import { execFileSync } from "node:child_process";

/** Raised when GitHub access (the `gh` CLI / auth) is unavailable — CLI maps to a clear gap (exit 2). */
export class GitHubUnavailableError extends Error {}

export interface GitHubPrMetadata {
  title: string;
  state: string;
  baseRefName: string;
  baseRefOid: string;
  headRefOid: string;
}

/**
 * Read-only: the repo-relative POSIX paths a GitHub PR changes, via the user's existing `gh` CLI
 * (no stored tokens — FR-005). De-duplicated and code-unit sorted for determinism. Throws
 * `GitHubUnavailableError` when `gh` is missing/unauthenticated or the PR is unreachable, so PR mode
 * degrades gracefully without blocking local-diff (FR-006). Never mutates the PR.
 */
export function prChangedFiles(prNumber: number): string[] {
  // `gh pr view <n> --json files` returns { files: [{ path }, ...] } — a read-only query.
  let raw: string;
  try {
    raw = execFileSync("gh", ["pr", "view", String(prNumber), "--json", "files"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new GitHubUnavailableError(
      `GitHub access unavailable for PR ${prNumber}. ` +
        `Ensure the \`gh\` CLI is installed and authenticated; local-diff review remains available.`,
    );
  }

  let parsed: { files?: { path: string }[] };
  try {
    parsed = JSON.parse(raw) as { files?: { path: string }[] };
  } catch {
    throw new GitHubUnavailableError(`Could not parse \`gh\` output for PR ${prNumber}.`);
  }

  const set = new Set<string>();
  for (const f of parsed.files ?? []) {
    const norm = f.path.trim().split("\\").join("/");
    if (norm) set.add(norm);
  }
  return [...set].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Read-only: optional PR metadata (title/state/base) for context. Throws on unavailable access. */
export function prMetadata(prNumber: number): GitHubPrMetadata {
  let raw: string;
  try {
    raw = execFileSync(
      "gh",
      ["pr", "view", String(prNumber), "--json", "title,state,baseRefName,baseRefOid,headRefOid"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
  } catch {
    throw new GitHubUnavailableError(`GitHub access unavailable for PR ${prNumber}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new GitHubUnavailableError(`Could not parse \`gh\` output for PR ${prNumber}.`);
  }
  if (!isGitHubPrMetadata(parsed)) {
    throw new GitHubUnavailableError(`GitHub metadata for PR ${prNumber} is incomplete.`);
  }
  return parsed;
}

function isGitHubPrMetadata(value: unknown): value is GitHubPrMetadata {
  if (value == null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  const oid = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u;
  return typeof record.title === "string"
    && typeof record.state === "string"
    && typeof record.baseRefName === "string"
    && typeof record.baseRefOid === "string"
    && oid.test(record.baseRefOid)
    && typeof record.headRefOid === "string"
    && oid.test(record.headRefOid);
}
