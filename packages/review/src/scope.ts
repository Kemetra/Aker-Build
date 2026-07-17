import type { QueueItem } from "@aker-build/queue";
import type { ScopeResult, ScopeViolation } from "./types.js";

/** The skipped scope result — used when no `--item` is supplied (FR-003 skip-and-note). */
export const SCOPE_SKIPPED: ScopeResult = { checked: false, violations: [] };

/**
 * Compare changed files against a queue item's declared scope (data-model `out_of_scope` rule):
 *   - a file in `forbidden_files`                          → violation "forbidden"
 *   - a file outside a NON-EMPTY `allowed_files`           → violation "outside_allowed"
 * An empty `allowed_files` means "no allow-list constraint" (only forbidden applies) — mirrors the
 * 006 forbidden-empty handling. Deterministic: violations follow the (already code-unit-sorted)
 * changed-files order.
 */
export function checkScope(changedFiles: readonly string[], item: QueueItem): ScopeResult {
  const forbidden = new Set(item.forbidden_files);
  const allowed = new Set(item.allowed_files);
  const hasAllowList = item.allowed_files.length > 0;

  const violations: ScopeViolation[] = [];
  for (const file of changedFiles) {
    if (forbidden.has(file)) {
      violations.push({ file, reason: "forbidden" });
    } else if (hasAllowList && !allowed.has(file)) {
      violations.push({ file, reason: "outside_allowed" });
    }
  }
  return { checked: true, item_id: item.id, violations };
}
