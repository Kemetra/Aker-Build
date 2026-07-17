import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { IntakeController } from "./intake.js";
import { BodyTooLargeError, readBody } from "./http-body.js";
import type { RuntimeMetrics } from "./metrics.js";
import type { BoundedJobQueue } from "./queue.js";
import type { RuntimeConfig } from "./runtime-config.js";

export interface RuntimeExecutor {
  terminateAll(): Promise<void>;
}

export interface RuntimeService {
  intake: IntakeController;
  queue: BoundedJobQueue;
  executor: RuntimeExecutor;
  metrics: RuntimeMetrics;
  config: RuntimeConfig;
  cleanup(): { removed: number; failed: number };
}

export interface RuntimeServer extends Server {
  shutdown(): Promise<void>;
}

export function startRuntimeServer(
  runtime: RuntimeService,
  options: { port?: number; installSignalHandlers?: boolean } = {},
): RuntimeServer {
  const server = createServer((req, res) => {
    void route(req, res, runtime);
  }) as RuntimeServer;

  server.requestTimeout = runtime.config.requestTimeoutMs;
  server.headersTimeout = runtime.config.headersTimeoutMs;
  server.keepAliveTimeout = runtime.config.keepAliveTimeoutMs;
  server.setTimeout(runtime.config.socketTimeoutMs);

  let shutdownPromise: Promise<void> | undefined;
  const signalHandler = () => void server.shutdown();
  const installSignals = options.installSignalHandlers ?? true;
  if (installSignals) {
    process.once("SIGINT", signalHandler);
    process.once("SIGTERM", signalHandler);
  }

  server.shutdown = () => {
    if (shutdownPromise) return shutdownPromise;
    shutdownPromise = (async () => {
      runtime.queue.stopAccepting();
      await waitForDrain(runtime.queue.onIdle(), runtime.config.jobTimeoutMs);
      await runtime.executor.terminateAll();
      const cleanup = runtime.cleanup();
      if (cleanup.failed > 0) runtime.metrics.increment("workspace_cleanup_failure_total", cleanup.failed);
      if (installSignals) {
        process.removeListener("SIGINT", signalHandler);
        process.removeListener("SIGTERM", signalHandler);
      }
      if (server.listening) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    })();
    return shutdownPromise;
  };

  server.listen(options.port ?? runtime.config.port, runtime.config.host);
  return server;
}

async function waitForDrain(onIdle: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      onIdle,
      new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function route(
  req: IncomingMessage,
  res: ServerResponse,
  runtime: RuntimeService,
): Promise<void> {
  try {
    const path = new URL(req.url ?? "/", "http://runtime.invalid").pathname;
    if (routeFixedEndpoint(path, res, runtime)) return;
    await routeWebhook(req, res, path, runtime);
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json(res, 413, { ok: false, error: "body_too_large" });
    return json(res, 500, { ok: false, error: "internal_error" });
  }
}

function routeFixedEndpoint(path: string, res: ServerResponse, runtime: RuntimeService): boolean {
  const endpoint = fixedEndpoints(res, runtime)[path];
  if (!endpoint) return false;
  endpoint();
  return true;
}

function fixedEndpoints(res: ServerResponse, runtime: RuntimeService): Record<string, () => void> {
  return {
    "/healthz": () => json(res, 200, { status: "ok" }),
    "/readyz": () => writeReadiness(res, runtime),
    "/metrics": () => writeMetrics(res, runtime),
  };
}

function writeReadiness(res: ServerResponse, runtime: RuntimeService): void {
  const ready = runtime.queue.isReady();
  json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready" });
}

function writeMetrics(res: ServerResponse, runtime: RuntimeService): void {
  const stats = runtime.queue.stats();
  runtime.metrics.set("queue_depth", stats.waiting + stats.reserved);
  runtime.metrics.set("active_workers", stats.active);
  json(res, 200, runtime.metrics.snapshot());
}

async function routeWebhook(req: IncomingMessage, res: ServerResponse, path: string, runtime: RuntimeService): Promise<void> {
  if (path !== "/webhook") return json(res, 404, { ok: false, error: "not_found" });
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });
  const result = await acceptWebhook(req, runtime);
  recordIntakeResult(result.reason, runtime);
  res.writeHead(result.status, { "content-type": "application/json" });
  activateOnceSettled(res, result.afterResponse);
  res.end(JSON.stringify({ ok: result.status < 400, status: result.reason }));
}

/**
 * An accepted delivery's queue reservation is already committed; the job must activate exactly once
 * regardless of how the response settles. Relying solely on `res.end`'s callback misses the case
 * where the client/socket closes before that callback fires, leaving the job stuck counting against
 * queue capacity. `close` fires in both the normal-finish and premature-disconnect cases, so listening
 * on it alone (guarded to run once) covers both without double-activating.
 */
function activateOnceSettled(res: ServerResponse, afterResponse: (() => void) | undefined): void {
  if (!afterResponse) return;
  let done = false;
  res.once("close", () => {
    if (done) return;
    done = true;
    afterResponse();
  });
}

async function acceptWebhook(req: IncomingMessage, runtime: RuntimeService) {
  const rawBody = await readBody(req, runtime.config.maxBodyBytes);
  runtime.metrics.increment("intake_total");
  return runtime.intake.accept({
    rawBody,
    signature: header(req.headers["x-hub-signature-256"]),
    eventName: header(req.headers["x-github-event"]),
    deliveryId: header(req.headers["x-github-delivery"]),
  });
}

function recordIntakeResult(reason: string, runtime: RuntimeService): void {
  const metric = intakeMetric(reason);
  if (metric) runtime.metrics.increment(metric);
}

function intakeMetric(reason: string): "accepted_total" | "duplicate_total" | "queue_rejected_total" | undefined {
  if (reason === "accepted") return "accepted_total";
  if (reason === "duplicate") return "duplicate_total";
  return reason === "queue_full" || reason === "delivery_cache_full" ? "queue_rejected_total" : undefined;
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function json(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
