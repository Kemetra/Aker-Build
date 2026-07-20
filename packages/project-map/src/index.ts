// Public surface for @aker-build/project-map (T015).
// The Project Map is Aker Build's canonical, evidence-derived model of a target repo.

export {
  SCHEMA_VERSION,
  coverageCapabilitySchema,
  coveragePackSchema,
  coverageSchema,
  evidenceSchema,
  projectMapSchema,
  type Coverage,
  type CoverageCapability,
  type CoveragePack,
  type Evidence,
  type ProjectMap,
} from "./schema.js";

export {
  validate,
  type ValidationError,
  type ValidationResult,
} from "./validate.js";

export { loadJson, loadYaml } from "./io.js";
