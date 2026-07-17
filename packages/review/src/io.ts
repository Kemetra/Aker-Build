import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { writeOutput } from "@aker-build/scanner";
import type { Queue, QueueItem } from "@aker-build/queue";
import { validateReview } from "./schema.js";
import type { ReviewReport } from "./types.js";

/** Raised when queue.json is missing (with `--item`) — CLI maps to "run queue first" (exit 1). */
export class MissingQueueError extends Error {}
/** Raised when no item with the given id exists — CLI maps to bad input (exit 2). */
export class UnknownItemError extends Error {}
/** Raised when the assembled review.json fails its own schema (a reviewer bug — nothing written). */
export class InvalidReviewError extends Error {}

/** Load queue.json from the out-dir and return the item with `id`. Read-only. */
export function loadQueueItem(outDir: string, id: string): QueueItem {
  const queuePath = resolve(outDir, "queue.json");
  if (!existsSync(queuePath)) {
    throw new MissingQueueError(`No produced queue at ${queuePath}. Run \`aker-build queue\` first.`);
  }
  const queue = JSON.parse(readFileSync(queuePath, "utf8")) as Queue;
  const item = queue.items.find((it) => it.id === id);
  if (!item) {
    const ids = queue.items.map((it) => it.id).join(", ") || "(none)";
    throw new UnknownItemError(`No queue item with id "${id}". Available ids: ${ids}`);
  }
  return item;
}

/** Validate the report against the review.json schema; throw InvalidReviewError on failure. */
export function assertValidReport(report: ReviewReport): void {
  const result = validateReview(report);
  if (!result.ok) {
    const detail = result.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ");
    throw new InvalidReviewError(`assembled review.json failed schema: ${detail}`);
  }
}

/** Write review.json + review.md to the out-dir (outside scanned tracked source, FR-013). */
export function writeReview(outDir: string, report: ReviewReport, markdown: string): { jsonPath: string; mdPath: string } {
  const jsonPath = writeOutput(outDir, "review.json", JSON.stringify(report, null, 2) + "\n");
  const mdPath = writeOutput(outDir, "review.md", markdown);
  return { jsonPath, mdPath };
}
