import { z } from "zod";

export const REPORT_SCHEMA_VERSION = 1;

const severitySummarySchema = z.object({
  low: z.number().int().min(0),
  medium: z.number().int().min(0),
  high: z.number().int().min(0),
  critical: z.number().int().min(0),
});

const suppressionSummarySchema = z.object({
  gate_id: z.string(),
  finding_status: z.enum(["risk", "needs_verification", "not_applicable"]),
  severity: z.enum(["low", "medium", "high", "critical"]).nullable(),
  id: z.string(),
  reason: z.string(),
  owner: z.string(),
  expires: z.string().optional(),
  matched_by: z.enum(["path", "finding_id"]),
});

export const reportSchema = z.object({
  schema_version: z.literal(REPORT_SCHEMA_VERSION),
  artifacts: z.object({
    present: z.array(z.string()),
    missing: z.array(z.string()),
  }),
  config: z.object({
    path: z.string().nullable(),
    project_name: z.string().optional(),
    project_type: z.string().optional(),
    include: z.array(z.string()).optional(),
    exclude: z.array(z.string()).optional(),
    suppressions_configured: z.number().int().min(0),
    error: z.string().optional(),
  }),
  spec_kit: z.object({
    present: z.boolean(),
    artifact_count: z.number().int().min(0),
    evidence_count: z.number().int().min(0),
    secret_like_count: z.number().int().min(0),
  }),
  summary: z.object({
    project_name: z.string().nullable(),
    repo_count: z.number().int().min(0),
    tenant_status: z.string().nullable(),
    findings: z.object({
      total: z.number().int().min(0),
      risk: z.number().int().min(0),
      needs_verification: z.number().int().min(0),
      not_applicable: z.number().int().min(0),
      suppressed: z.number().int().min(0),
      by_severity: severitySummarySchema,
    }),
    queue: z.object({
      total: z.number().int().min(0),
      ready: z.number().int().min(0),
      blocked: z.number().int().min(0),
      done: z.number().int().min(0),
    }),
    route: z.object({
      next_id: z.string().nullable(),
      blocked: z.number().int().min(0),
      no_safe_task_reasons: z.array(z.string()),
    }),
    review: z
      .object({
        verdict: z.enum(["ready", "not_ready", "needs_verification"]),
        changed_files: z.number().int().min(0),
        findings: z.number().int().min(0),
        comparison: z.object({
          complete: z.boolean(),
          new: z.number().int().min(0),
          existing: z.number().int().min(0),
          resolved: z.number().int().min(0),
          changed: z.number().int().min(0),
          unattributed: z.number().int().min(0),
        }).optional(),
      })
      .nullable(),
  }),
  suppressions: z.array(suppressionSummarySchema),
});

export interface ReportValidationResult {
  ok: boolean;
  errors: { path: string; message: string }[];
}

export function validateReport(report: unknown): ReportValidationResult {
  const result = reportSchema.safeParse(report);
  if (result.success) return { ok: true, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  };
}
