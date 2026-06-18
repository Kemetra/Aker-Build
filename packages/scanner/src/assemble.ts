import type { ProjectMap } from "@tenantguard/project-map";
import { SCHEMA_VERSION } from "@tenantguard/project-map";
import type { RunNote } from "./types.js";
import { detectStack } from "./detect/stack.js";
import { detectRepos } from "./detect/repos.js";
import { readFileSafe } from "./io.js";
import { basename } from "node:path";

export interface AssembleResult {
  map: ProjectMap;
  notes: RunNote[];
}

/**
 * Build a 002-conforming ProjectMap from detection signals, applying honesty defaults
 * (empty/null + not_detected when no evidence) and stable ordering (determinism, R3).
 */
export function assemble(
  root: string,
  listFiles: (root: string) => string[],
): AssembleResult {
  const notes: RunNote[] = [];
  const files = listFiles(root);

  const stack = detectStack(root);
  const { repos } = detectRepos(root, listFiles);

  // Tenant model: best-effort, honest. Look for a tenant scoping marker; default not_detected.
  const hasTenantMarker = files.some((f) => {
    if (!/\.(ts|js|sql|py|go)$/.test(f)) return false;
    const c = readFileSafe(root, f);
    return c !== null && /\btenant_id\b/.test(c);
  });

  const tenant_model = hasTenantMarker
    ? {
        status: "detected" as const,
        strategy: "shared_db_shared_schema",
        tenant_key: "tenant_id",
        required_surfaces: [] as string[],
      }
    : {
        status: "not_detected" as const,
        strategy: null,
        tenant_key: null,
        required_surfaces: [] as string[],
      };

  // Critical surfaces: high-signal dir/file conventions, sorted (deterministic).
  const surfaceSet = new Set<string>();
  for (const f of files) {
    const top = f.split("/");
    if (top.includes("migrations") || /migrations?\//.test(f)) surfaceSet.add("db_migrations");
    if (basename(f).endsWith(".sql")) surfaceSet.add("db_migrations");
    if (top.includes("webhooks")) surfaceSet.add("webhooks");
  }
  const critical_surfaces = [...surfaceSet].sort();

  const project_name = basename(root) || "project";

  const map: ProjectMap = {
    version: SCHEMA_VERSION,
    project: {
      name: project_name,
      detected_stack: {
        runtime: stack.runtime,
        package_manager: stack.package_manager,
        frameworks: stack.frameworks, // already sorted in detectStack
      },
    },
    repos, // already sorted by path in detectRepos
    boundaries: [], // MVP: best-effort; left empty/honest (FR-006)
    tenant_model,
    critical_surfaces,
  };

  // Honesty: when nothing meaningful was detected, record an insufficient-evidence note (FR-008).
  const nothingDetected =
    stack.runtime === null && repos.length === 0 && tenant_model.status === "not_detected";
  if (nothingDetected) {
    notes.push({
      kind: "insufficient_evidence",
      path: null,
      message: "no recognizable project structure detected; map is empty by design (not fabricated)",
    });
  } else if (tenant_model.status === "not_detected") {
    notes.push({
      kind: "insufficient_evidence",
      path: null,
      message: "no tenant model detected; tenant_model left not_detected (not fabricated)",
    });
  }

  return { map, notes };
}
