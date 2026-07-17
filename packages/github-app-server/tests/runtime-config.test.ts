import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { loadRuntimeConfig, RuntimeConfigError } from "../src/runtime-config.js";

describe("bounded runtime configuration", () => {
  it("loads the reviewed defaults", () => {
    const config = loadRuntimeConfig({});
    expect(config).toMatchObject({
      host: "127.0.0.1",
      port: 3000,
      maxBodyBytes: 5 * 1024 * 1024,
      workerConcurrency: 2,
      maxWaitingJobs: 32,
      checkStartTimeoutMs: 5_000,
      jobTimeoutMs: 120_000,
      gitTimeoutMs: 60_000,
      staleWorkspaceAgeMs: 15 * 60_000,
      deliveryTtlMs: 15 * 60_000,
    });
    expect(config.scanBudget).toEqual({
      maxFiles: 50_000,
      maxFileBytes: 2 * 1024 * 1024,
      maxTotalBytes: 250 * 1024 * 1024,
    });
    expect(config.tmpRoot).toBe(resolve(join(tmpdir(), "aker-build-app")));
  });

  it("accepts explicit values inside safe ranges", () => {
    const config = loadRuntimeConfig({
      AKER_BUILD_BIND_HOST: "0.0.0.0",
      PORT: "8080",
      AKER_BUILD_WORKER_CONCURRENCY: "4",
      AKER_BUILD_MAX_WAITING_JOBS: "64",
      AKER_BUILD_SCAN_MAX_FILES: "1000",
      AKER_BUILD_TMP_ROOT: "C:\\tmp\\aker-runtime",
    });
    expect(config).toMatchObject({ host: "0.0.0.0", port: 8080, workerConcurrency: 4, maxWaitingJobs: 64 });
    expect(config.scanBudget.maxFiles).toBe(1000);
    expect(config.tmpRoot).toBe(resolve("C:\\tmp\\aker-runtime"));
  });

  it.each([
    ["PORT", "0"],
    ["AKER_BUILD_WORKER_CONCURRENCY", "17"],
    ["AKER_BUILD_MAX_WAITING_JOBS", "0"],
    ["AKER_BUILD_CHECK_START_TIMEOUT_MS", "9000"],
    ["AKER_BUILD_SCAN_MAX_FILE_BYTES", "1024"],
  ])("rejects unsafe %s without echoing its value", (name, value) => {
    expect.assertions(3);
    try {
      loadRuntimeConfig({ [name]: value });
    } catch (error) {
      expect(error).toBeInstanceOf(RuntimeConfigError);
      expect((error as Error).message).toContain(name);
      expect((error as Error).message).not.toContain(value);
    }
  });
});
