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
    if (path === "/healthz") return json(res, 200, { status: "ok" });
    if (path === "/readyz") {
      const ready = runtime.queue.isReady();
      return json(res, ready ? 200 : 503, { status: ready ? "ready" : "not_ready" });
    }
    if (path === "/metrics") {
      const stats = runtime.queue.stats();
      runtime.metrics.set("queue_depth", stats.waiting + stats.reserved);
      runtime.metrics.set("active_workers", stats.active);
      return json(res, 200, runtime.metrics.snapshot());
    }
    if (path !== "/webhook") return json(res, 404, { ok: false, error: "not_found" });
    if (req.method !== "POST") return json(res, 405, { ok: false, error: "method_not_allowed" });

    const rawBody = await readBody(req, runtime.config.maxBodyBytes);
    runtime.metrics.increment("intake_total");
    const result = await runtime.intake.accept({
      rawBody,
      signature: header(req.headers["x-hub-signature-256"]),
      eventName: header(req.headers["x-github-event"]),
      deliveryId: header(req.headers["x-github-delivery"]),
    });
    if (result.reason === "accepted") runtime.metrics.increment("accepted_total");
    else if (result.reason === "duplicate") runtime.metrics.increment("duplicate_total");
    else if (result.reason === "queue_full" || result.reason === "delivery_cache_full") {
      runtime.metrics.increment("queue_rejected_total");
    }
    const body = JSON.stringify({ ok: result.status < 400, status: result.reason });
    res.writeHead(result.status, { "content-type": "application/json" });
    res.end(body, () => result.afterResponse?.());
  } catch (error) {
    if (error instanceof BodyTooLargeError) return json(res, 413, { ok: false, error: "body_too_large" });
    return json(res, 500, { ok: false, error: "internal_error" });
  }
}

function header(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function json(res: ServerResponse, status: number, body: object): void {
  res.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}
