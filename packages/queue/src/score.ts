import type { QueueItem, QueueContext, Level } from "./types.js";

const LEVEL_VALUE: Record<Level, number> = { low: 0, medium: 1, high: 2, critical: 3 };

/** Per-factor contribution of an item's score, kept for the explicit reason output (FR-005). */
export interface ScoreBreakdown {
  total: number;
  blastRadius: number;
  factors: { name: string; contribution: number; note: string }[];
}

/**
 * Weighted-sum scorer over the spec's named factors (ADR-004). All factors are normalized to [0,1]
 * and combined with explicit weights; higher score = safer/more-ready. Pure + deterministic.
 */
export function scoreItem(item: QueueItem, ctx: QueueContext): ScoreBreakdown {
  const changed = new Set(ctx.inputs.changedFiles);
  const lockFiles = item.lock_scope.files;
  const overlap = lockFiles.some((f) => changed.has(f));
  const blastRadius = lockFiles.length; // breadth of files the item affects

  // Each factor: { weight, value in [0,1], note }
  const factors = [
    { name: "readiness", weight: 0.35, value: item.status === "ready" ? 1 : 0, note: `status=${item.status}` },
    { name: "risk", weight: 0.1, value: 1 - LEVEL_VALUE[item.risk] / 3, note: `risk=${item.risk}` },
    {
      name: "confidence",
      weight: 0.1,
      value: item.confidence_tier === "suspected" ? 0 : 1,
      note: `tier=${item.confidence_tier ?? "confirmed"}`,
    },
    {
      name: "blast_radius",
      weight: 0.15,
      value: 1 / (1 + blastRadius),
      note: `${blastRadius} file(s) in lock scope`,
    },
    {
      name: "validation",
      weight: 0.1,
      value: item.validation.length > 0 ? 1 : 0,
      note: item.validation.length > 0 ? "validation available" : "no validation",
    },
    {
      name: "scope_clarity",
      weight: 0.1,
      value: item.allowed_files.length > 0 ? 1 : 0,
      note: item.allowed_files.length > 0 ? "scoped allowed_files" : "unscoped",
    },
    {
      name: "lock_overlap",
      weight: 0.1,
      value: overlap ? 0 : 1,
      note: overlap ? "overlaps current diff" : "no overlap with current diff",
    },
  ];

  let total = 0;
  const contributions = factors.map((f) => {
    const contribution = f.weight * f.value;
    total += contribution;
    return { name: f.name, contribution, note: f.note };
  });

  return { total, blastRadius, factors: contributions };
}

/** Top contributing factor notes, for a concise human reason. */
export function topReasons(b: ScoreBreakdown, n = 3): string[] {
  return [...b.factors]
    .sort((a, c) => c.contribution - a.contribution)
    .slice(0, n)
    .map((f) => f.note);
}
