import type { QueueItem } from "@aker-build/queue";
import type { ScopeGap } from "./types.js";

/**
 * Check whether a real 005 QueueItem carries the scope info required to compile a SAFE prompt
 * (FR-009, data-model). Required: non-empty `title` (→ Objective), non-empty `allowed_files`,
 * non-empty `validation`. `forbidden_files` is present-may-be-empty (the 005 deriver emits `[]`,
 * meaning "nothing forbidden beyond the default git rules") and is intentionally NOT checked.
 *
 * Returns a ScopeGap listing the missing fields; an empty `missing` array means compilable.
 */
export function checkScope(item: QueueItem): ScopeGap {
  const missing: string[] = [];
  if (!item.title || item.title.trim() === "") missing.push("title");
  if (!Array.isArray(item.allowed_files) || item.allowed_files.length === 0) missing.push("allowed_files");
  if (!Array.isArray(item.validation) || item.validation.length === 0) missing.push("validation");
  return { missing };
}

/** True if the item is safely compilable (no missing required scope fields). */
export function isCompilable(item: QueueItem): boolean {
  return checkScope(item).missing.length === 0;
}
