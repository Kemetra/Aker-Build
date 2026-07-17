import type { z } from "zod";
import type { reportSchema } from "./schema.js";

export type AkerBuildReport = z.infer<typeof reportSchema>;

export interface ReportOptions {
  out?: string;
}

export interface WrittenReport {
  jsonPath: string;
  mdPath: string;
  report: AkerBuildReport;
}
