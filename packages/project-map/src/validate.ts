import { projectMapSchema } from "./schema.js";

export interface ValidationError {
  /** Dotted field path, e.g. "tenant_model.strategy". Empty string = document root. */
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: ValidationError[];
}

/**
 * Validate a parsed Project Map object (JSON or YAML — both parse to the same object).
 * Returns every error with its field path (FR-008); never throws on invalid input,
 * never touches the network or filesystem (FR-010).
 */
export function validate(map: unknown): ValidationResult {
  const result = projectMapSchema.safeParse(map);
  if (result.success) {
    return { ok: true, errors: [] };
  }
  const errors: ValidationError[] = result.error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
  return { ok: false, errors };
}
