import type { ChecksPayload } from "@aker-build/github-app";
import type { RuntimeGitHubApi } from "./github-api.js";

/**
 * The narrow slice of octokit this adapter calls. Declaring it as a small structural type (rather
 * than importing octokit's enormous generated types) keeps the adapter thin and lets tests inject a
 * fake. The real wiring passes an actual `Octokit` instance, which satisfies this shape.
 */
export interface OctokitLike {
  /** Auto-follows Link pagination and returns the FULL concatenated item list. */
  paginate: (route: unknown, params: unknown) => Promise<Array<{ filename: string }>>;
  rest: {
    pulls: {
      listFiles: (params: unknown) => unknown;
      get: (params: {
        owner: string;
        repo: string;
        pull_number: number;
      }) => Promise<{ data: { title: string; state: string; base: { ref: string } } }>;
    };
    checks: {
      listForRef: (params: {
        owner: string;
        repo: string;
        ref: string;
        check_name?: string;
      }) => Promise<{ data: { check_runs: Array<{ id: number; name: string }> } }>;
      create: (params: ChecksCreateParams) => Promise<{ data: { id: number } }>;
      update: (params: ChecksUpdateParams) => Promise<{ data: unknown }>;
    };
  };
}

interface ChecksCreateParams {
  owner: string;
  repo: string;
  name: string;
  head_sha: string;
  conclusion?: ChecksPayload["conclusion"];
  status?: "in_progress";
  external_id?: string;
  request?: { signal?: AbortSignal };
  output: { title: string; summary: string; annotations: ChecksPayload["annotations"] };
}

interface ChecksUpdateParams {
  owner: string;
  repo: string;
  check_run_id: number;
  conclusion?: ChecksPayload["conclusion"];
  status?: "in_progress";
  external_id?: string;
  request?: { signal?: AbortSignal };
  output: { title: string; summary: string; annotations: ChecksPayload["annotations"] };
}

/** Map a 014 `ChecksPayload` onto the Checks API `output` block (field shapes already align). */
function toOutput(payload: ChecksPayload) {
  return { title: payload.title, summary: payload.summary, annotations: payload.annotations };
}

/**
 * Concrete `GitHubApi` over octokit. `listChangedFiles` is retained as a paginated legacy
 * compatibility surface, but production v2 derives ranges from base/head webhook-SHA checkouts and
 * does not call it for review correctness. The behavioral weight of the active methods is carried by
 * the fake-injected `dispatch` test, not by asserting "octokit was called".
 */
export function makeGitHubApi(octokit: OctokitLike): RuntimeGitHubApi {
  return {
    async listChangedFiles({ owner, repo, prNumber }) {
      const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });
      return files.map((f) => f.filename);
    },

    async getPrMetadata({ owner, repo, prNumber }) {
      const { data } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
      return { title: data.title, state: data.state, baseRefName: data.base.ref };
    },

    async findCheckRun({ owner, repo, headSha }) {
      const { data } = await octokit.rest.checks.listForRef({
        owner,
        repo,
        ref: headSha,
        check_name: "Aker Build",
      });
      const run = data.check_runs.find((r) => r.name === "Aker Build");
      return run ? { id: run.id } : null;
    },

    async createCheckRun({ owner, repo, headSha, payload }) {
      const { data } = await octokit.rest.checks.create({
        owner,
        repo,
        name: payload.name,
        head_sha: headSha,
        conclusion: payload.conclusion,
        output: toOutput(payload),
      });
      return { id: data.id };
    },

    async updateCheckRun({ owner, repo, checkId, payload }) {
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkId,
        conclusion: payload.conclusion,
        output: toOutput(payload),
      });
    },

    async createInProgressCheckRun({ owner, repo, headSha, deliveryHash, signal }) {
      const { data } = await octokit.rest.checks.create({
        owner,
        repo,
        name: "Aker Build",
        head_sha: headSha,
        status: "in_progress",
        external_id: deliveryHash,
        output: { title: "Review queued", summary: "Aker Build accepted this delivery and queued a bounded review.", annotations: [] },
        request: { signal },
      });
      return { id: data.id };
    },

    async updateInProgressCheckRun({ owner, repo, checkId, deliveryHash, signal }) {
      await octokit.rest.checks.update({
        owner,
        repo,
        check_run_id: checkId,
        status: "in_progress",
        external_id: deliveryHash,
        output: { title: "Review queued", summary: "Aker Build accepted this delivery and queued a bounded review.", annotations: [] },
        request: { signal },
      });
    },
  };
}
