import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ScanBudget } from "@aker-build/scanner";

export interface RuntimeConfig {
  host: string;
  port: number;
  maxBodyBytes: number;
  workerConcurrency: number;
  maxWaitingJobs: number;
  checkStartTimeoutMs: number;
  jobTimeoutMs: number;
  gitTimeoutMs: number;
  scanBudget: ScanBudget;
  staleWorkspaceAgeMs: number;
  deliveryTtlMs: number;
  deliveryCacheEntries: number;
  tmpRoot: string;
  requestTimeoutMs: number;
  headersTimeoutMs: number;
  keepAliveTimeoutMs: number;
  socketTimeoutMs: number;
}

export class RuntimeConfigError extends Error {
  constructor(name: string) {
    super(`missing or invalid runtime setting: ${name}`);
    this.name = "RuntimeConfigError";
  }
}

export function loadRuntimeConfig(env: Record<string, string | undefined> = process.env): RuntimeConfig {
  return {
    host: loadHost(env),
    port: integer(env, "PORT", { fallback: 3000, min: 1, max: 65_535 }),
    maxBodyBytes: integer(env, "AKER_BUILD_MAX_BODY_BYTES", { fallback: 5 * 1024 * 1024, min: 64 * 1024, max: 10 * 1024 * 1024 }),
    workerConcurrency: integer(env, "AKER_BUILD_WORKER_CONCURRENCY", { fallback: 2, min: 1, max: 16 }),
    maxWaitingJobs: integer(env, "AKER_BUILD_MAX_WAITING_JOBS", { fallback: 32, min: 1, max: 512 }),
    checkStartTimeoutMs: integer(env, "AKER_BUILD_CHECK_START_TIMEOUT_MS", { fallback: 5_000, min: 1_000, max: 8_000 }),
    jobTimeoutMs: integer(env, "AKER_BUILD_JOB_TIMEOUT_MS", { fallback: 120_000, min: 10_000, max: 600_000 }),
    gitTimeoutMs: integer(env, "AKER_BUILD_GIT_TIMEOUT_MS", { fallback: 60_000, min: 5_000, max: 300_000 }),
    scanBudget: loadScanBudget(env),
    staleWorkspaceAgeMs: integer(env, "AKER_BUILD_STALE_WORKSPACE_AGE_MS", { fallback: 15 * 60_000, min: 60_000, max: 24 * 60 * 60_000 }),
    deliveryTtlMs: integer(env, "AKER_BUILD_DELIVERY_TTL_MS", { fallback: 15 * 60_000, min: 60_000, max: 24 * 60 * 60_000 }),
    deliveryCacheEntries: integer(env, "AKER_BUILD_DELIVERY_CACHE_ENTRIES", { fallback: 4096, min: 64, max: 10_000 }),
    tmpRoot: loadTmpRoot(env),
    ...loadHttpTimeouts(env),
  };
}

function loadHost(env: Record<string, string | undefined>): string {
  const host = env.AKER_BUILD_BIND_HOST?.trim() || "127.0.0.1";
  if (host.length > 253 || !/^[A-Za-z0-9.:-]+$/u.test(host)) throw new RuntimeConfigError("AKER_BUILD_BIND_HOST");
  return host;
}

function loadScanBudget(env: Record<string, string | undefined>): ScanBudget {
  return {
    maxFiles: integer(env, "AKER_BUILD_SCAN_MAX_FILES", { fallback: 50_000, min: 100, max: 250_000 }),
    maxFileBytes: integer(env, "AKER_BUILD_SCAN_MAX_FILE_BYTES", { fallback: 2 * 1024 * 1024, min: 64 * 1024, max: 10 * 1024 * 1024 }),
    maxTotalBytes: integer(env, "AKER_BUILD_SCAN_MAX_TOTAL_BYTES", { fallback: 250 * 1024 * 1024, min: 1024 * 1024, max: 2 * 1024 * 1024 * 1024 }),
  };
}

function loadTmpRoot(env: Record<string, string | undefined>): string {
  const configuredRoot = env.AKER_BUILD_TMP_ROOT?.trim();
  if (env.AKER_BUILD_TMP_ROOT !== undefined && !configuredRoot) throw new RuntimeConfigError("AKER_BUILD_TMP_ROOT");
  return resolve(configuredRoot || join(tmpdir(), "aker-build-app"));
}

function loadHttpTimeouts(env: Record<string, string | undefined>): Pick<RuntimeConfig, "requestTimeoutMs" | "headersTimeoutMs" | "keepAliveTimeoutMs" | "socketTimeoutMs"> {
  return {
    requestTimeoutMs: integer(env, "AKER_BUILD_REQUEST_TIMEOUT_MS", { fallback: 10_000, min: 1_000, max: 30_000 }),
    headersTimeoutMs: integer(env, "AKER_BUILD_HEADERS_TIMEOUT_MS", { fallback: 5_000, min: 1_000, max: 15_000 }),
    keepAliveTimeoutMs: integer(env, "AKER_BUILD_KEEP_ALIVE_TIMEOUT_MS", { fallback: 5_000, min: 1_000, max: 30_000 }),
    socketTimeoutMs: integer(env, "AKER_BUILD_SOCKET_TIMEOUT_MS", { fallback: 15_000, min: 1_000, max: 60_000 }),
  };
}

interface IntegerBounds {
  fallback: number;
  min: number;
  max: number;
}

function integer(
  env: Record<string, string | undefined>,
  name: string,
  bounds: IntegerBounds,
): number {
  const raw = env[name];
  if (raw === undefined) return bounds.fallback;
  if (!/^[0-9]+$/u.test(raw)) throw new RuntimeConfigError(name);
  const value = Number(raw);
  assertSafeInteger(value, name);
  assertInRange(value, bounds.min, bounds.max, name);
  return value;
}

function assertSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) throw new RuntimeConfigError(name);
}

function assertInRange(value: number, min: number, max: number, name: string): void {
  if (value < min) throw new RuntimeConfigError(name);
  if (value > max) throw new RuntimeConfigError(name);
}
