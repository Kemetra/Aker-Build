// Public surface for @tenantguard/queue.
// Derive queue.json from map + findings; route one next-safest task (005).

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { buildContext } from "./context.js";
import { deriveItems } from "./derive.js";
import { detectCycles, depsSatisfied } from "./deps.js";
import { routeQueue } from "./route.js";
import { QUEUE_SCHEMA_VERSION, validateQueue, validateRouteDecision } from "./schema.js";
import { writeQueue, writeRoute, QUEUE_FILENAME } from "./io.js";
import type { Queue, RouterDecision, QueueOptions, RouteOptions, RouterInputs, QueueItem } from "./types.js";

const DEFAULT_OUT = ".tenantguard";

/** Raised when a produced artifact fails its own schema (a bug — nothing is written). */
export class InvalidQueueError extends Error {}
export class InvalidRouteError extends Error {}
/** Raised when route() is called but no queue.json exists — CLI maps to "run queue first" (exit 1). */
export class MissingQueueError extends Error {}

/** Resolve deriver statuses for dependency/cycle blocking, so queue.json reflects readiness. */
function resolveQueueStatuses(items: QueueItem[]): QueueItem[] {
  const cycles = detectCycles(items);
  const byId = new Map(items.map((it) => [it.id, it]));
  return items.map((it) => {
    if (it.status !== "ready") return it;
    const cycle = cycles.get(it.id);
    if (cycle) return { ...it, status: "blocked" as const, blocked_reason: cycle };
    if (!depsSatisfied(it, byId)) {
      const unmet = it.depends_on.filter((d) => byId.get(d)?.status !== "done");
      return { ...it, status: "blocked" as const, blocked_reason: `unmet dependencies: ${unmet.join(", ")}` };
    }
    return it;
  });
}

/**
 * Derive queue.json from the produced project-map.json + risks.json in `out`. Read-only on the
 * scanned repo; does NOT write the file (use deriveQueueToFile).
 */
export function deriveQueue(targetPath: string, opts: QueueOptions = {}): Queue {
  const out = opts.out ?? DEFAULT_OUT;
  const ctx = buildContext(resolve(targetPath), out);
  const items = resolveQueueStatuses(deriveItems(ctx));
  const queue: Queue = { schema_version: QUEUE_SCHEMA_VERSION, items };

  const result = validateQueue(queue);
  if (!result.ok) {
    throw new InvalidQueueError(
      `produced queue.json failed schema validation: ${result.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ")}`,
    );
  }
  return queue;
}

/** Derive the queue and write queue.json to the out-dir. */
export function deriveQueueToFile(targetPath: string, opts: QueueOptions = {}): { outPath: string; queue: Queue } {
  const out = opts.out ?? DEFAULT_OUT;
  const queue = deriveQueue(targetPath, opts);
  return { outPath: writeQueue(out, queue), queue };
}

/**
 * Route the produced queue.json to one next-safest task. Reads queue.json from `out`; builds the
 * router context (map + risks + optional diff). Returns the decision; does NOT write the file.
 */
export function route(targetPath: string, opts: RouteOptions = {}, inputs?: Partial<RouterInputs>): RouterDecision {
  const out = opts.out ?? DEFAULT_OUT;
  const queuePath = resolve(out, QUEUE_FILENAME);
  if (!existsSync(queuePath)) {
    throw new MissingQueueError(`No produced queue at ${queuePath}. Run \`tenantguard queue\` first.`);
  }
  const parsed = JSON.parse(readFileSync(queuePath, "utf8")) as Queue;
  const ctx = buildContext(resolve(targetPath), out, inputs);
  const decision = routeQueue(parsed.items, ctx);

  const result = validateRouteDecision(decision);
  if (!result.ok) {
    throw new InvalidRouteError(
      `produced route.json failed schema validation: ${result.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ")}`,
    );
  }
  return decision;
}

/** Route and write route.json to the out-dir. */
export function routeToFile(targetPath: string, opts: RouteOptions = {}, inputs?: Partial<RouterInputs>): { outPath: string; decision: RouterDecision } {
  const out = opts.out ?? DEFAULT_OUT;
  const decision = route(targetPath, opts, inputs);
  return { outPath: writeRoute(out, decision), decision };
}

export { buildContext, MissingProjectMapError, MissingRisksError, NotGitRepoError, InvalidInputError } from "./context.js";
export { deriveItems } from "./derive.js";
export { detectCycles, depsSatisfied } from "./deps.js";
export { routeQueue } from "./route.js";
export { scoreItem } from "./score.js";
export {
  queueItemSchema,
  queueSchema,
  routeDecisionSchema,
  validateQueue,
  validateRouteDecision,
  QUEUE_SCHEMA_VERSION,
  QUEUE_ITEM_STATUSES,
  QUEUE_ITEM_TYPES,
} from "./schema.js";
export type {
  QueueItem,
  Queue,
  RouterDecision,
  RouterInputs,
  QueueContext,
  QueueOptions,
  RouteOptions,
  Level,
  QueueItemStatus,
  QueueItemType,
} from "./types.js";
