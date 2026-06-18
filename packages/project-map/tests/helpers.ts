import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
// contracts live in the spec dir: specs/002-project-map-schema/contracts/
const contractsDir = resolve(here, "../../../specs/002-project-map-schema/contracts");

export function readContract(name: string): string {
  return readFileSync(resolve(contractsDir, name), "utf8");
}

/** A minimal conforming map, built in code so tests don't depend on YAML parsing. */
export function conformingMap(): Record<string, unknown> {
  return {
    version: 1,
    project: {
      name: "fixture",
      detected_stack: { runtime: "node", package_manager: "pnpm", frameworks: ["nextjs"] },
    },
    repos: [{ name: "api", path: "apps/api", type: "backend", owns: ["auth"] }],
    boundaries: [{ id: "B-001", rule: "frontend_calls_api_only", description: "x" }],
    tenant_model: {
      status: "detected",
      strategy: "shared_db_shared_schema",
      tenant_key: "tenant_id",
      required_surfaces: ["api_routes"],
    },
    critical_surfaces: ["api_routes"],
  };
}
