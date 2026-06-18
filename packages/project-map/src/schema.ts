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
    metadata: metadataSchema,
  })
  .passthrough();

export type Evidence = z.infer<typeof evidenceSchema>;
export type ProjectMap = z.infer<typeof projectMapSchema>;
