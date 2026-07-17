import { describe, expect, it, vi } from "vitest";
import type { PullRequestEvent } from "@aker-build/github-app";
import { makeCheckStarter } from "../src/check-lifecycle.js";
import type { RuntimeGitHubApi } from "../src/github-api.js";

const EVENT: PullRequestEvent = {
  owner: "org",
  repo: "repo",
  prNumber: 7,
  baseSha: "b".repeat(40),
  headSha: "a".repeat(40),
  isDraft: false,
  installationId: 99,
};

function api(over: Partial<RuntimeGitHubApi> = {}): RuntimeGitHubApi {
  return {
    async listChangedFiles() {
      return [];
    },
    async getPrMetadata() {
      return { title: "", state: "open", baseRefName: "main" };
    },
    async findCheckRun() {
      return null;
    },
    async createCheckRun() {
      return { id: 1 };
    },
    async updateCheckRun() {},
    async createInProgressCheckRun() {
      return { id: 2 };
    },
    async updateInProgressCheckRun() {},
    ...over,
  };
}

describe("in-progress check lifecycle", () => {
  it("updates an existing check instead of creating a duplicate", async () => {
    const update = vi.fn(async () => {});
    const create = vi.fn(async () => ({ id: 2 }));
    const starter = makeCheckStarter(
      api({ async findCheckRun() { return { id: 44 }; }, updateInProgressCheckRun: update, createInProgressCheckRun: create }),
      { baseDelayMs: 0, jitter: () => 0 },
    );
    const signal = new AbortController().signal;

    await expect(starter.ensureInProgress(EVENT, { deliveryHash: "hash", signal })).resolves.toBe(44);
    expect(update).toHaveBeenCalledOnce();
    expect(create).not.toHaveBeenCalled();
  });

  it("re-finds after an ambiguous transient create failure before retrying", async () => {
    let visible = false;
    const create = vi.fn(async () => {
      visible = true;
      throw Object.assign(new Error("response lost"), { status: 502 });
    });
    const update = vi.fn(async () => {});
    const starter = makeCheckStarter(
      api({
        async findCheckRun() {
          return visible ? { id: 55 } : null;
        },
        createInProgressCheckRun: create,
        updateInProgressCheckRun: update,
      }),
      { baseDelayMs: 0, jitter: () => 0 },
    );

    await expect(
      starter.ensureInProgress(EVENT, { deliveryHash: "hash", signal: new AbortController().signal }),
    ).resolves.toBe(55);
    expect(create).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledOnce();
  });

  it("does not retry an authorization failure", async () => {
    const create = vi.fn(async () => {
      throw Object.assign(new Error("forbidden"), { status: 403 });
    });
    const starter = makeCheckStarter(api({ createInProgressCheckRun: create }), {
      baseDelayMs: 0,
      jitter: () => 0,
    });
    await expect(
      starter.ensureInProgress(EVENT, { deliveryHash: "hash", signal: new AbortController().signal }),
    ).rejects.toThrow("forbidden");
    expect(create).toHaveBeenCalledOnce();
  });
});
