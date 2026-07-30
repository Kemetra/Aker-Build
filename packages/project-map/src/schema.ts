import { z } from "zod";

/** Current Project Map schema version (R5). */
export const SCHEMA_VERSION = 1;

/**
 * Shared Evidence Object (FR-004b) — the normative `{type, path, line, signal, confidence}`
 * shape reused by downstream specs (gates 004, queue 005, prompts 006, reviewer 007).
 * `.strip()` (Zod default) drops unknown keys, so a stray `secret` field never survives (FR-011).
 */
export const evidenceSchema = z.object({
  type: z.enum([
    "file",
    "line",
    "changed_file",
    "missing_artifact",
    "failed_command",
    "pr_metadata",
    "ci_status",
    "spec_file",
  ]),
  path: z.string().nullable(),
  line: z.number().int().nullable().optional(),
  signal: z.string(),
  confidence: z.enum(["high", "medium", "low"]),
});

const detectedStackSchema = z.object({
  runtime: z.string().nullable(),
  package_manager: z.string().nullable(),
  frameworks: z.array(z.string()),
  // Coverage honesty: which detected frameworks the detectors actually understand. Lets "no
  // findings" be read as "no findings in covered frameworks" rather than as safety. Defaulted so
  // maps written before this field still validate (output contract stays backward-compatible).
  coverage: z
    .object({
      covered: z.array(z.string()).default([]),
      uncovered: z.array(z.string()).default([]),
    })
    .default({ covered: [], uncovered: [] }),
});

const projectSchema = z.object({
  name: z.string(),
  detected_stack: detectedStackSchema,
});

const repoSchema = z.object({
  name: z.string(),
  path: z.string(),
  type: z.string(), // extensible enum: backend | frontend | worker | other
  owns: z.array(z.string()),
});

const boundarySchema = z.object({
  id: z.string(),
  rule: z.string(),
  description: z.string(),
});

const TENANT_STATUS = ["detected", "not_detected", "unknown", "not_applicable"] as const;

const tenantModelSchema = z
  .object({
    status: z.enum(TENANT_STATUS),
    strategy: z.string().nullable(),
    tenant_key: z.string().nullable(),
    required_surfaces: z.array(z.string()),
  })
  .superRefine((tm, ctx) => {
    // Honesty rule (FR-004a): when status != detected, strategy must be null/"unknown"
    // and tenant_key must be null — never a fabricated value.
    if (tm.status !== "detected") {
      if (tm.strategy !== null && tm.strategy !== "unknown") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["strategy"],
          message: `strategy must be null or "unknown" when status is "${tm.status}" (no fabricated value)`,
        });
      }
      if (tm.tenant_key !== null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["tenant_key"],
          message: `tenant_key must be null when status is "${tm.status}" (no fabricated value)`,
        });
      }
    }
  });

const metadataSchema = z
  .object({
    description: z.string().optional(),
    generated_at: z.string().optional(),
  })
  .optional();

/**
 * The Project Map document schema. `.passthrough()` tolerates unknown top-level fields
 * (FR-007 forward compatibility) — unknown fields are ignored, never a hard failure.
 */
export const projectMapSchema = z
  .object({
    version: z.number().int().min(1),
    project: projectSchema,
    repos: z.array(repoSchema),
    boundaries: z.array(boundarySchema),
    tenant_model: tenantModelSchema,
    critical_surfaces: z.array(z.string()),
    data_access: z.array(evidenceSchema).optional(),
    routes: z.array(evidenceSchema).optional(),
    migrations: z.array(evidenceSchema).optional(),
    auth: z.array(evidenceSchema).optional(),
    config_surface: z.array(evidenceSchema).optional(),
    metadata: metadataSchema,
  })
  .passthrough();

export type Evidence = z.infer<typeof evidenceSchema>;
export type ProjectMap = z.infer<typeof projectMapSchema>;
