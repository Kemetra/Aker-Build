import type { QueueItem } from "./types.js";

/**
 * Detect dependency cycles in the `depends_on` graph via DFS coloring.
 * Returns a map of item id → a human-readable cycle description for every id that participates in a
 * cycle (FR-010, R5). Empty map = acyclic.
 */
export function detectCycles(items: QueueItem[]): Map<string, string> {
  const byId = new Map(items.map((it) => [it.id, it]));
  const color = new Map<string, 0 | 1 | 2>(); // 0=white, 1=gray(on stack), 2=black
  const cycles = new Map<string, string>();
  const stack: string[] = [];

  const visit = (id: string): void => {
    color.set(id, 1);
    stack.push(id);
    const item = byId.get(id);
    for (const dep of item?.depends_on ?? []) {
      if (!byId.has(dep)) continue; // unknown dep is a separate concern, not a cycle
      const c = color.get(dep) ?? 0;
      if (c === 1) {
        // Back-edge → cycle. Describe it from `dep` around to the current id.
        const from = stack.indexOf(dep);
        const ring = stack.slice(from);
        const desc = `circular dependency: ${[...ring, dep].join(" -> ")}`;
        for (const node of ring) cycles.set(node, desc);
      } else if (c === 0) {
        visit(dep);
      }
    }
    stack.pop();
    color.set(id, 2);
  };

  for (const it of items) {
    if ((color.get(it.id) ?? 0) === 0) visit(it.id);
  }
  return cycles;
}

/** True if every dependency of `item` exists and is `done`. Unknown/non-done deps → not satisfied. */
export function depsSatisfied(item: QueueItem, byId: Map<string, QueueItem>): boolean {
  return item.depends_on.every((d) => byId.get(d)?.status === "done");
}
