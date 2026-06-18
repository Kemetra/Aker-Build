// Public surface for @tenantguard/project-map (T015).
// The Project Map is TenantGuard's canonical, evidence-derived model of a target repo.

export {
  SCHEMA_VERSION,
  evidenceSchema,
  projectMapSchema,
  type Evidence,
  type ProjectMap,
} from "./schema.js";

export {
  validate,
  type ValidationError,
  type ValidationResult,
} from "./validate.js";

export { loadJson, loadYaml } from "./io.js";
