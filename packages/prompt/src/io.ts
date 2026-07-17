import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { writeOutput } from "@aker-build/scanner";
import type { Queue, QueueItem } from "@aker-build/queue";

/** Raised when queue.json is missing — CLI maps to "run queue first" (exit 1). */
export class MissingQueueError extends Error {}
/** Raised when no item with the given id exists — CLI maps to bad input (exit 2). */
export class UnknownItemError extends Error {}

/** Load queue.json from the out-dir and return the item with `id`. Read-only. */
export function loadItem(outDir: string, id: string): QueueItem {
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

/** Write the compiled prompt to `<outDir>/prompt-<ID>.md` (outside scanned tracked source, FR-014). */
export function writePrompt(outDir: string, id: string, markdown: string): string {
  return writeOutput(outDir, `prompt-${id}.md`, markdown);
}
