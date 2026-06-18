import { z } from "zod";
import { evidenceSchema } from "@tenantguard/project-map";
import { SEVERITIES } from "@tenantguard/gates";

/** Canonical review.json schema version. */
export const REVIEW_SCHEMA_VERSION = 1;

const severitySchema = z.enum(SEVERITIES);

/**
 * A contributing review finding. Either a diff-attributable 004 gate finding (only `risk` /
 * `needs_verification` survive into a review — `not_applicable` never contributes) or a scope
 * violation. Discriminated implicitly by the union; evidence reuses 002's `evidenceSchema`
 * (imported, never redefined — FR-009: its `.strip()` default drops any stray `secret` key).
 */
const gateFindingSchema = z.discriminatedUnion("status", [
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
]);

const scopeFindingSchema = z.object({
  kind: z.literal("scope"),
  file: z.string(),
  reason: z.enum(["forbidden", "outside_allowed"]),
  item_id: z.string(),
});

export const reviewFindingSchema = z.union([gateFindingSchema, scopeFindingSchema]);

const scopeResultSchema = z.object({
  checked: z.boolean(),
  item_id: z.string().optional(),
  violations: z.array(
    z.object({ file: z.string(), reason: z.enum(["forbidden", "outside_allowed"]) }),
  ),
});

const prMetadataSchema = z.object({
  number: z.number().int(),
  title: z.string(),
  state: z.string(),
  base_ref: z.string(),
});

/** The review.json document. */
export const reviewSchema = z.object({
  schema_version: z.number().int().min(1),
  mode: z.enum(["local-diff", "pr"]),
  verdict: z.enum(["ready", "not_ready", "needs_verification"]),
  changed_files: z.array(z.string()),
  findings: z.array(reviewFindingSchema),
  scope: scopeResultSchema,
  github_available: z.boolean().nullable(),
  pr: prMetadataSchema.optional(),
});

export interface ReviewValidationResult {
  ok: boolean;
  errors: { path: string; message: string }[];
}

/** Validate a parsed review.json object. Never throws; never touches network/fs. */
export function validateReview(review: unknown): ReviewValidationResult {
  const result = reviewSchema.safeParse(review);
  if (result.success) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
  };
}
