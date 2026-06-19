import { z } from "zod";
import { evidenceSchema } from "@tenantguard/project-map";

/** Canonical queue.json / route.json schema version. */
export const QUEUE_SCHEMA_VERSION = 1;

export const QUEUE_ITEM_STATUSES = ["ready", "blocked", "done"] as const;
export const QUEUE_ITEM_TYPES = ["implementation", "test", "docs", "migration", "chore"] as const;
const LEVELS = ["low", "medium", "high", "critical"] as const;

/**
 * Queue item schema (full contract per spec/data-model). `source.evidence` reuses 002's
 * `evidenceSchema` (imported, NOT redefined — FR-003); `.strip()` keeps secrets out (FR-012).
 */
export const queueItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(QUEUE_ITEM_STATUSES),
  type: z.enum(QUEUE_ITEM_TYPES),
  source: z.object({ evidence: z.array(evidenceSchema) }),
  priority: z.enum(LEVELS),
  risk: z.enum(LEVELS),
  confidence_tier: z.enum(["confirmed", "suspected"]).optional(),
  depends_on: z.array(z.string()),
  lock_scope: z.object({ files: z.array(z.string()) }),
  allowed_files: z.array(z.string()),
  forbidden_files: z.array(z.string()),
  gates: z.array(z.string()),
  validation: z.array(z.string()),
  stop_conditions: z.array(z.string()),
  final_report: z.object({ required: z.array(z.string()) }),
  blocked_reason: z.string().nullable().optional(),
});

/** queue.json: a single items[] array, stably sorted by id. */
export const queueSchema = z.object({
  schema_version: z.number().int().min(1),
  items: z.array(queueItemSchema),
});

/** route.json: single stable shape — next (nullable) + blocked[] + no_safe_task_reasons[] (FR-015). */
export const routeDecisionSchema = z.object({
  next: z
    .object({ id: z.string(), title: z.string(), reason: z.array(z.string()) })
    .nullable(),
  blocked: z.array(z.object({ id: z.string(), reason: z.string() })),
  no_safe_task_reasons: z.array(z.string()),
});

export interface QueueValidationResult {
  ok: boolean;
  errors: { path: string; message: string }[];
}

function toResult(result: z.SafeParseReturnType<unknown, unknown>): QueueValidationResult {
  if (result.success) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}

/** Validate a parsed queue.json object. Never throws; never touches network/fs. */
export function validateQueue(queue: unknown): QueueValidationResult {
  return toResult(queueSchema.safeParse(queue));
}

/** Validate a parsed route.json object. */
export function validateRouteDecision(decision: unknown): QueueValidationResult {
  return toResult(routeDecisionSchema.safeParse(decision));
}
