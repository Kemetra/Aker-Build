import type { QueueItem, QueueContext, RouterDecision, Level } from "./types.js";
import { detectCycles, depsSatisfied } from "./deps.js";
import { scoreItem, topReasons, type ScoreBreakdown } from "./score.js";

const LEVEL_VALUE: Record<Level, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * Resolve each item's effective status + blocking reason given dependencies, cycles, and lock-scope
 * overlap with the current diff. Returns a new array (immutability) — never mutates inputs.
 */
function resolveStatuses(items: QueueItem[], ctx: QueueContext): QueueItem[] {
  const cycles = detectCycles(items);
  const byId = new Map(items.map((it) => [it.id, it]));
  const changed = new Set(ctx.inputs.changedFiles);

  return items.map((it) => {
    if (it.status === "blocked") return it; // deriver already blocked it (e.g. needs_verification)
    const cycle = cycles.get(it.id);
    if (cycle) return { ...it, status: "blocked" as const, blocked_reason: cycle };
    if (!depsSatisfied(it, byId)) {
      const unmet = it.depends_on.filter((d) => byId.get(d)?.status !== "done");
      return { ...it, status: "blocked" as const, blocked_reason: `unmet dependencies: ${unmet.join(", ")}` };
    }
    if (it.lock_scope.files.some((f) => changed.has(f))) {
      return { ...it, status: "blocked" as const, blocked_reason: "lock scope overlaps the current diff" };
    }
    return it;
  });
}

/** Comparator implementing the pinned ordering: score desc → blast_radius asc → risk asc → id asc. */
function compare(
  a: { item: QueueItem; score: ScoreBreakdown },
  b: { item: QueueItem; score: ScoreBreakdown },
): number {
  if (b.score.total !== a.score.total) return b.score.total - a.score.total; // score desc
  if (a.score.blastRadius !== b.score.blastRadius) return a.score.blastRadius - b.score.blastRadius; // blast asc
  const ra = LEVEL_VALUE[a.item.risk];
  const rb = LEVEL_VALUE[b.item.risk];
  if (ra !== rb) return ra - rb; // risk asc
  return a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0; // id asc (code-unit)
}

/**
 * Route a derived queue to one next-safest task. Deterministic; never an arbitrary pick (FR-007).
 * Returns a single stable shape (FR-015): next (nullable) + blocked[] + no_safe_task_reasons[].
 */
export function routeQueue(items: QueueItem[], ctx: QueueContext): RouterDecision {
  const resolved = resolveStatuses(items, ctx);

  const blocked = resolved
    .filter((it) => it.status === "blocked")
    .map((it) => ({ id: it.id, reason: it.blocked_reason ?? "blocked" }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const ready = resolved.filter((it) => it.status === "ready");

  if (ready.length === 0) {
    const reasons: string[] = [];
    if (resolved.length === 0) reasons.push("the queue is empty");
    else reasons.push(`all ${resolved.length} item(s) are blocked`);
    return { next: null, blocked, no_safe_task_reasons: reasons };
  }

  const scored = ready.map((item) => ({ item, score: scoreItem(item, ctx) }));
  scored.sort(compare);
  const winner = scored[0]!;

  return {
    next: {
      id: winner.item.id,
      title: winner.item.title,
      reason: [
        `highest score (${winner.score.total.toFixed(2)})`,
        ...topReasons(winner.score),
      ],
    },
    blocked,
    no_safe_task_reasons: [],
  };
}
