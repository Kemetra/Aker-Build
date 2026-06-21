import { describe, it, expect } from "vitest";
import type { ChecksPayload } from "@tenantguard/github-app";
import { makeGitHubApi, type OctokitLike } from "../src/octokit-api.js";

const payload: ChecksPayload = {
  name: "TenantGuard",
  conclusion: "success",
  title: "ok",
  summary: "ok",
  annotations: [],
};

/** A fake octokit recording calls; `paginate` returns the FULL flattened set (simulating multi-page). */
function fakeOctokit(over: Partial<OctokitLike> = {}): OctokitLike & { calls: string[] } {
  const calls: string[] = [];
  const base: OctokitLike = {
    // Real octokit.paginate auto-follows Link headers and returns ALL items concatenated. A correct
    // adapter must use it (not a single .rest.pulls.listFiles page) or it truncates large PRs.
    paginate: async () => [{ filename: "a.ts" }, { filename: "b.ts" }, { filename: "c.ts" }],
    rest: {
      pulls: {
        listFiles: (() => {}) as unknown as OctokitLike["rest"]["pulls"]["listFiles"],
        get: async () => ({ data: { title: "PR title", state: "open", base: { ref: "main" } } }),
      },
      checks: {
        listForRef: async () => ({ data: { check_runs: [] } }),
        create: async () => {
          calls.push("checks.create");
          return { data: { id: 555 } };
        },
        update: async () => {
          calls.push("checks.update");
          return { data: {} };
        },
      },
    },
  };
  return { calls, ...base, ...over };
}

describe("makeGitHubApi — concrete GitHubApi over octokit", () => {
  it("listChangedFiles aggregates ALL pages via paginate (no page-1 truncation)", async () => {
    const octo = fakeOctokit();
    const api = makeGitHubApi(octo);

    const files = await api.listChangedFiles({ owner: "o", repo: "r", prNumber: 1 });

    // All three files from the (multi-page) paginated result — not just the first page.
    expect(files).toEqual(["a.ts", "b.ts", "c.ts"]);
  });

  it("getPrMetadata maps the PR get response to the port shape", async () => {
    const api = makeGitHubApi(fakeOctokit());
    const meta = await api.getPrMetadata({ owner: "o", repo: "r", prNumber: 1 });
    expect(meta).toEqual({ title: "PR title", state: "open", baseRefName: "main" });
  });

  it("findCheckRun returns null when no TenantGuard run exists for the head", async () => {
    const api = makeGitHubApi(fakeOctokit());
    const found = await api.findCheckRun({ owner: "o", repo: "r", headSha: "sha1" });
    expect(found).toBeNull();
  });

  it("findCheckRun returns the existing TenantGuard run id when present", async () => {
    const octo = fakeOctokit({
      rest: {
        ...fakeOctokit().rest,
        checks: {
          ...fakeOctokit().rest.checks,
          listForRef: async () => ({
            data: { check_runs: [{ id: 7, name: "TenantGuard" }, { id: 8, name: "other" }] },
          }),
        },
      },
    });
    const api = makeGitHubApi(octo);
    const found = await api.findCheckRun({ owner: "o", repo: "r", headSha: "sha1" });
    expect(found).toEqual({ id: 7 });
  });

  it("createCheckRun returns the new check id", async () => {
    const api = makeGitHubApi(fakeOctokit());
    const res = await api.createCheckRun({ owner: "o", repo: "r", headSha: "sha1", payload });
    expect(res).toEqual({ id: 555 });
  });
});
