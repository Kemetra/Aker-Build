import { z } from "zod";
import { evidenceSchema } from "@tenantguard/project-map";

/** Canonical risks.json schema version. */
export const RISKS_SCHEMA_VERSION = 1;

/** Ordered severity labels (low→critical). Applies only to `risk` findings. */
export const SEVERITIES = ["low", "medium", "high", "critical"] as const;
const severitySchema = z.enum(SEVERITIES);

/**
 * Finding shape — a discriminated union on `status` (004 R4). The discriminator makes the
 * status-conditional invariants compile-/validation-time guarantees:
 * - risk → severity (enum) + >=1 evidence object
 * - needs_verification → severity null + >=1 evidence object
 * - not_applicable → severity null + >=0 evidence objects
 * Evidence reuses 002's `evidenceSchema` (imported, NOT redefined — FR-003). Its `.strip()`
 * default drops any stray key, so a `secret` field can never survive (FR-009).
 */
export const findingSchema = z.discriminatedUnion("status", [
  z.object({
    gate_id: z.string(),
    status: z.literal("risk"),
    severity: severitySchema,
    evidence: z.array(evidenceSchema).min(1),
  }),
  z.object({
    gate_id: z.string(),
    status: z.literal("needs_verification"),
    severity: z.null(),
    evidence: z.array(evidenceSchema).min(1),
  }),
  z.object({
    gate_id: z.string(),
    status: z.literal("not_applicable"),
    severity: z.null(),
    evidence: z.array(evidenceSchema),
  }),
]);

/** The risks.json document: a single unified findings[] array (no per-status lists — FR-012). */
export const risksSchema = z.object({
  schema_version: z.number().int().min(1),
  findings: z.array(findingSchema),
});

export interface RisksValidationResult {
  ok: boolean;
  errors: { path: string; message: string }[];
}

/** Validate a parsed risks.json object. Never throws; never touches network/fs. */
export function validateRisks(risks: unknown): RisksValidationResult {
  const result = risksSchema.safeParse(risks);
  if (result.success) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}
