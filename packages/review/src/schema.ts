import { z } from "zod";
import { evidenceSchema } from "@aker-build/project-map";
import { SEVERITIES } from "@aker-build/gates";

/** Canonical review.json schema version. */
export const REVIEW_SCHEMA_VERSION = 2;

const severitySchema = z.enum(SEVERITIES);
const suppressionSchema = z.object({
  id: z.string(),
  reason: z.string(),
  owner: z.string(),
  expires: z.string().optional(),
  matched_by: z.enum(["path", "finding_id"]),
});

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
    suppression: suppressionSchema.optional(),
  }),
  z.object({
    gate_id: z.string(),
    status: z.literal("needs_verification"),
    severity: z.null(),
    evidence: z.array(evidenceSchema).min(1),
    suppression: suppressionSchema.optional(),
  }),
  z.object({
    gate_id: z.string(),
    status: z.literal("not_applicable"),
    severity: z.null(),
    evidence: z.array(evidenceSchema),
    suppression: suppressionSchema.optional(),
  }),
]);

const scopeFindingSchema = z.object({
  kind: z.literal("scope"),
  file: z.string(),
  reason: z.enum(["forbidden", "outside_allowed"]),
  item_id: z.string(),
});

export const reviewFindingSchema = z.union([
  gateFindingSchema,
  scopeFindingSchema,
]);

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

const commonReviewFields = {
  mode: z.enum(["local-diff", "pr"]),
  verdict: z.enum(["ready", "not_ready", "needs_verification"]),
  changed_files: z.array(z.string()),
  scope: scopeResultSchema,
  github_available: z.boolean().nullable(),
  pr: prMetadataSchema.optional(),
};

export const reviewSchemaV1 = z.object({
  schema_version: z.literal(1),
  ...commonReviewFields,
  findings: z.array(z.union([
    z.discriminatedUnion("status", [
      gateFindingSchema.options[0],
      gateFindingSchema.options[1],
    ]),
    scopeFindingSchema,
  ])),
});

const classificationSchema = z.enum(["new", "existing", "resolved", "changed", "unattributed"]);
const comparedGateFindingSchema = gateFindingSchema.and(z.object({
  classification: classificationSchema,
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/u),
  source: z.enum(["base", "head"]),
  line_changed: z.boolean(),
  change: z.enum(["worsened", "improved", "modified"]).optional(),
}));
const incompleteReasonSchema = z.enum([
  "base_unavailable",
  "head_unavailable",
  "diff_unavailable",
  "unsafe_path",
  "submodule_unsupported",
  "lfs_unsupported",
]);
const comparisonRefSchema = z.object({ label: z.string().min(1), sha: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u).nullable() });

export const reviewSchemaV2 = z.object({
  schema_version: z.literal(REVIEW_SCHEMA_VERSION),
  ...commonReviewFields,
  changed_ranges: z.array(z.object({
    path: z.string().min(1),
    ranges: z.array(z.object({ start: z.number().int().positive(), end: z.number().int().positive() })),
    binary: z.boolean(),
  })),
  findings: z.array(z.union([comparedGateFindingSchema, scopeFindingSchema])),
  comparison: z.object({
    base: comparisonRefSchema,
    head: comparisonRefSchema,
    complete: z.boolean(),
    incomplete_reasons: z.array(incompleteReasonSchema),
    counts: z.object({
      new: z.number().int().min(0),
      existing: z.number().int().min(0),
      resolved: z.number().int().min(0),
      changed: z.number().int().min(0),
      unattributed: z.number().int().min(0),
    }),
  }),
});

/** Frozen v1 consumer contract plus strict v2 producer contract. */
export const reviewSchema = z.discriminatedUnion("schema_version", [reviewSchemaV1, reviewSchemaV2]);

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
