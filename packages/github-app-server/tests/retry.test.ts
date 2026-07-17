import { describe, expect, it, vi } from "vitest";
import { isTransientGitHubError, retryTransient } from "../src/retry.js";

describe("bounded GitHub retry", () => {
  it("retries transient 5xx failures up to three total attempts", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("one"), { status: 500 }))
      .mockRejectedValueOnce(Object.assign(new Error("two"), { status: 503 }))
      .mockResolvedValue("ok");
    const onRetry = vi.fn();

    await expect(
      retryTransient(operation, { maxAttempts: 3, baseDelayMs: 0, jitter: () => 0, onRetry }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it.each([400, 401, 403, 404, 422])("never retries status %s", async (status) => {
    const operation = vi.fn(async () => {
      throw Object.assign(new Error("fixed"), { status });
    });
    await expect(retryTransient(operation, { maxAttempts: 3, baseDelayMs: 0 })).rejects.toThrow("fixed");
    expect(operation).toHaveBeenCalledOnce();
  });

  it("classifies bounded network failures but not arbitrary errors", () => {
    expect(isTransientGitHubError(Object.assign(new Error(), { code: "ECONNRESET" }))).toBe(true);
    expect(isTransientGitHubError(Object.assign(new Error(), { code: "EAI_AGAIN" }))).toBe(true);
    expect(isTransientGitHubError(new Error("secret-adjacent unknown"))).toBe(false);
  });
});
