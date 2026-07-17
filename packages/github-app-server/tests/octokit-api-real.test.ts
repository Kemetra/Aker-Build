import { describe, it, expect } from "vitest";
import { Octokit } from "@octokit/rest";
import type { ChecksPayload } from "@aker-build/github-app";
import { makeGitHubApi, type OctokitLike } from "../src/octokit-api.js";

/**
 * FORTIFICATION (advisor #1): drive `makeGitHubApi` over a REAL `Octokit` with an injected `fetch`,
 * not a hand-built fake. This is the only test that exercises the `as unknown as OctokitLike` cast
 * against octokit's actual param names, real `paginate` Link-header following, and real `response.data`
 * parsing — a wrong param name (`pull_number` vs `prNumber`) or a broken pagination assumption fails
 * HERE, where every other octokit test cannot (they assert a fake the author wrote). No network: the
 * fetch is canned.
 */

const payload: ChecksPayload = {
  name: "Aker Build",
  conclusion: "failure",
  title: "t",
  summary: "s",
  annotations: [],
};

/** Build a canned `fetch` that routes by URL+method to fixed responses and records the requests. */
function cannedFetch(routes: Array<{ match: RegExp; method?: string; status?: number; body: unknown; headers?: Record<string, string> }>) {
  const requests: Array<{ url: string; method: string }> = [];
  const fetch = async (url: string, opts: { method?: string } = {}) => {
    const method = (opts.method ?? "GET").toUpperCase();
    requests.push({ url, method });
    const route = routes.find((r) => r.match.test(url) && (!r.method || r.method === method));
    if (!route) {
      return new Response(JSON.stringify({ message: "no canned route" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(route.body), {
      status: route.status ?? 200,
      headers: { "content-type": "application/json", ...(route.headers ?? {}) },
    });
  };
  return { fetch, requests };
}

function realApi(routes: Parameters<typeof cannedFetch>[0]) {
  const { fetch, requests } = cannedFetch(routes);
  const octokit = new Octokit({ auth: "test-token", request: { fetch } });
  return { api: makeGitHubApi(octokit as unknown as OctokitLike), requests };
}

describe("makeGitHubApi over a REAL Octokit + injected fetch (kills the cast-through-unknown gap)", () => {
  it("listChangedFiles follows REAL Link-header pagination and aggregates ALL pages", async () => {
    // Page 1 carries a Link: rel="next" header → octokit.paginate MUST follow it to page 2.
    const { api, requests } = realApi([
      {
        match: /\/pulls\/7\/files\?.*page=2|\/pulls\/7\/files.*&page=2/,
        body: [{ filename: "c.ts" }, { filename: "d.ts" }],
      },
      {
        match: /\/pulls\/7\/files/,
        body: [{ filename: "a.ts" }, { filename: "b.ts" }],
        headers: {
          // A real GitHub Link header pointing at page 2 — the thing a single-page fetch ignores.
          link: '<https://api.github.com/repos/o/r/pulls/7/files?per_page=100&page=2>; rel="next"',
        },
      },
    ]);

    const files = await api.listChangedFiles({ owner: "o", repo: "r", prNumber: 7 });

    // All four files across both pages — proves real pagination, not page-1 truncation.
    expect(files).toEqual(["a.ts", "b.ts", "c.ts", "d.ts"]);
    // Two real GETs were made to the files endpoint (page 1 + followed page 2).
    expect(requests.filter((r) => /\/pulls\/7\/files/.test(r.url)).length).toBeGreaterThanOrEqual(2);
  });

  it("getPrMetadata hits the REAL pulls.get route and maps the real response shape", async () => {
    const { api, requests } = realApi([
      { match: /\/pulls\/7$/, body: { title: "Real PR", state: "open", base: { ref: "main" } } },
    ]);
    const meta = await api.getPrMetadata({ owner: "o", repo: "r", prNumber: 7 });
    expect(meta).toEqual({ title: "Real PR", state: "open", baseRefName: "main" });
    // Confirms the param name maps to /pulls/{pull_number}, not /pulls/{prNumber}.
    expect(requests.some((r) => /\/repos\/o\/r\/pulls\/7$/.test(r.url))).toBe(true);
  });

  it("createCheckRun POSTs to the REAL checks route with the mapped body and returns the id", async () => {
    const { api, requests } = realApi([
      { match: /\/check-runs$/, method: "POST", body: { id: 4242 } },
    ]);
    const res = await api.createCheckRun({ owner: "o", repo: "r", headSha: "a".repeat(40), payload });
    expect(res).toEqual({ id: 4242 });
    expect(requests.some((r) => r.method === "POST" && /\/repos\/o\/r\/check-runs$/.test(r.url))).toBe(true);
  });

  it("findCheckRun queries the REAL check-runs-for-ref route and finds the Aker Build run", async () => {
    const { api } = realApi([
      {
        match: /\/commits\/[0-9a-f]+\/check-runs/,
        body: { total_count: 2, check_runs: [{ id: 11, name: "other" }, { id: 22, name: "Aker Build" }] },
      },
    ]);
    const found = await api.findCheckRun({ owner: "o", repo: "r", headSha: "b".repeat(40) });
    expect(found).toEqual({ id: 22 });
  });
});
