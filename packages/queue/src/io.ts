import { writeOutput } from "@tenantguard/scanner";
import type { Queue, RouterDecision } from "./types.js";

export const QUEUE_FILENAME = "queue.json";
export const ROUTE_FILENAME = "route.json";

/** Write the Queue to `<outDir>/queue.json` (outside scanned tracked source, FR-016). */
export function writeQueue(outDir: string, queue: Queue): string {
  return writeOutput(outDir, QUEUE_FILENAME, JSON.stringify(queue, null, 2));
}

/** Write the RouterDecision to `<outDir>/route.json`. */
export function writeRoute(outDir: string, decision: RouterDecision): string {
  return writeOutput(outDir, ROUTE_FILENAME, JSON.stringify(decision, null, 2));
}
