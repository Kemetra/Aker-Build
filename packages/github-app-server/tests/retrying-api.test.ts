import { describe, expect, it, vi } from "vitest";
import type { RuntimeGitHubApi } from "../src/github-api.js";
import { makeRetryingGitHubApi } from "../src/retrying-api.js";

function fakeApi(overrides: Partial<RuntimeGitHubApi> = {}): RuntimeGitHubApi {
  return {
    listChangedFiles: vi.fn(async () => []),
    getPrMetadata: vi.fn(async () => ({ title: "", state: "open", baseRefName: "main" })),
    findCheckRun: vi.fn(async () => null),
    createCheckRun: vi.fn(async () => ({ id: 1 })),
    updateCheckRun: vi.fn(async () => {}),
    createInProgressCheckRun: vi.fn(async () => ({ id: 1 })),
    updateInProgressCheckRun: vi.fn(async () => {}),
    ...overrides,
  };
}

const transientError = Object.assign(new Error("temporary"), { status: 503 });

describe("makeRetryingGitHubApi", () => {
  it("never retries updateCheckRun when the payload carries annotations", async () => {
    const updateCheckRun = vi.fn(async () => { throw transientError; });
    const api = makeRetryingGitHubApi(fakeApi({ updateCheckRun }), { maxAttempts: 3, baseDelayMs: 0 });

    await expect(api.updateCheckRun({
      owner: "org",
      repo: "repo",
      checkId: 1,
      payload: {
        name: "Aker Build",
        conclusion: "failure",
        title: "t",
        summary: "s",
        annotations: [{ path: "a.ts", start_line: 1, end_line: 1, annotation_level: "failure", title: "t", message: "m" }],
      },
    })).rejects.toThrow();
    expect(updateCheckRun).toHaveBeenCalledOnce();
  });

  it("retries updateCheckRun when the payload has no annotations", async () => {
    const updateCheckRun = vi
      .fn<RuntimeGitHubApi["updateCheckRun"]>()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue(undefined);
    const api = makeRetryingGitHubApi(fakeApi({ updateCheckRun }), { maxAttempts: 3, baseDelayMs: 0 });

    await expect(api.updateCheckRun({
      owner: "org",
      repo: "repo",
      checkId: 1,
      payload: { name: "Aker Build", conclusion: "success", title: "t", summary: "s", annotations: [] },
    })).resolves.toBeUndefined();
    expect(updateCheckRun).toHaveBeenCalledTimes(2);
  });

  it("always retries updateInProgressCheckRun, which never carries annotations", async () => {
    const updateInProgressCheckRun = vi
      .fn<RuntimeGitHubApi["updateInProgressCheckRun"]>()
      .mockRejectedValueOnce(transientError)
      .mockResolvedValue(undefined);
    const api = makeRetryingGitHubApi(fakeApi({ updateInProgressCheckRun }), { maxAttempts: 3, baseDelayMs: 0 });

    await expect(api.updateInProgressCheckRun({
      owner: "org",
      repo: "repo",
      checkId: 1,
      deliveryHash: "0123456789abcdef",
    })).resolves.toBeUndefined();
    expect(updateInProgressCheckRun).toHaveBeenCalledTimes(2);
  });
});
