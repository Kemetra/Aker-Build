import type { Evidence, ProjectMap } from "@tenantguard/project-map";
import type { RiskList } from "@tenantguard/gates";

/** Ordered level used for both priority and risk. */
export type Level = "low" | "medium" | "high" | "critical";

export type QueueItemStatus = "ready" | "blocked" | "done";
export type QueueItemType = "implementation" | "test" | "docs" | "migration" | "chore";

/** A safe, scoped unit of work derived from evidence (full contract per spec/data-model). */
export interface QueueItem {
  id: string;
  title: string;
  status: QueueItemStatus;
  type: QueueItemType;
  source: { evidence: Evidence[] };
  priority: Level;
  risk: Level;
  depends_on: string[];
  lock_scope: { files: string[] };
  allowed_files: string[];
  forbidden_files: string[];
  gates: string[];
  validation: string[];
  stop_conditions: string[];
  final_report: { required: string[] };
  /** Reason an item is blocked (deriver/router-set; not part of the persisted contract surface). */
  blocked_reason?: string | null;
}

/** The derived queue (queue.json). */
export interface Queue {
  schema_version: number;
  items: QueueItem[];
}

/** The router decision (route.json) — single stable shape (FR-015). */
export interface RouterDecision {
  next: { id: string; title: string; reason: string[] } | null;
  blocked: { id: string; reason: string }[];
  no_safe_task_reasons: string[];
}

/** Optional read-only evidence available to the router. */
export interface RouterInputs {
  /** Repo-relative changed files from the current local diff (read-only). Empty when unavailable. */
  changedFiles: string[];
}

/** Context for derivation/routing. */
export interface QueueContext {
  projectMap: ProjectMap;
  risks: RiskList;
  repoRoot: string;
  inputs: RouterInputs;
}

export interface QueueOptions {
  out?: string;
}

export interface RouteOptions {
  out?: string;
}
