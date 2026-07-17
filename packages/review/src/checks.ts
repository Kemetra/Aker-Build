import { confidenceTier } from "@aker-build/gates";
import { isLineChanged } from "./diff.js";
import { renderReport } from "./render.js";
import type {
  AnyReviewReport,
  ComparedGateFinding,
  ReviewFinding,
  ReviewFindingV2,
  ReviewReport,
  ReviewReportV2,
  ScopeFinding,
  Verdict,
} from "./types.js";

export interface CheckAnnotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: "failure" | "warning" | "notice";
  title: string;
  message: string;
}

export interface ChecksPayload {
  name: string;
  conclusion: "success" | "neutral" | "failure";
  title: string;
  summary: string;
  annotations: CheckAnnotation[];
}

const MAX_ANNOTATIONS = 50;

const CONCLUSION: Record<Verdict, ChecksPayload["conclusion"]> = {
  ready: "success",
  not_ready: "failure",
  needs_verification: "neutral",
};

/**
 * Map ONE review finding to ONE annotation. Branches on the union discriminant FIRST — a scope
 * violation has no `evidence`/`gate_id`, so calling confidenceTier or reading `.evidence` on it
 * would throw. Mirrors render.ts's `"kind" in f` discrimination.
 */
function annotate(f: ReviewFinding | ReviewFindingV2): CheckAnnotation {
  if ("kind" in f) {
    return {
      path: f.file,
      start_line: 1,
      end_line: 1,
      annotation_level: "failure",
      title: `scope: ${f.item_id}`,
      message: f.reason === "forbidden" ? "forbidden file changed" : "change outside allowed files",
    };
  }
  const e = f.evidence[0];
  const line = e?.line ?? 1; // evidence line is genuinely nullable (file-level findings)
  const tier = confidenceTier(f);
  const level: CheckAnnotation["annotation_level"] =
    f.status === "needs_verification" ? "notice" : tier === "confirmed" ? "failure" : "warning";
  return {
    path: e?.path ?? "(unknown)",
    start_line: line,
    end_line: line,
    annotation_level: level,
    title: `${f.gate_id} (${f.status})`,
    message: e?.signal ?? "",
  };
}

function sortKey(a: CheckAnnotation): string {
  return `${a.path} ${String(a.start_line).padStart(8, "0")} ${a.title}`;
}

/**
 * Render a ReviewReport into a GitHub Checks payload — report-only by construction (it produces a
 * status + annotations only; there is no field that commits, merges, or mutates). `conclusion`
 * inherits the verdict's calibrated, confirmed-only blocking (P2), so there is no second gating
 * rule to keep in sync. Pure data — no network / @octokit. Annotations are sorted (determinism)
 * and capped at 50 per payload (GitHub's per-request limit); overflow is stated, never silent.
 */
export function renderChecksPayload(report: ReviewReport | AnyReviewReport): ChecksPayload {
  const annotationFindings = isV2(report)
    ? report.findings.filter((finding): finding is ComparedGateFinding | ScopeFinding => {
        if ("kind" in finding) return true;
        const evidence = finding.evidence[0];
        const contributes = finding.classification === "new"
          || (finding.classification === "changed" && finding.change === "worsened");
        return contributes
          && finding.source === "head"
          && finding.line_changed
          && !finding.suppression
          && evidence?.path != null
          && evidence.line != null
          && isLineChanged(report.changed_ranges, evidence.path, evidence.line);
      })
    : report.findings;
  const all = annotationFindings
    .map(annotate)
    .sort((x, y) => (sortKey(x) < sortKey(y) ? -1 : sortKey(x) > sortKey(y) ? 1 : 0));
  const annotations = all.slice(0, MAX_ANNOTATIONS);
  const overflow = all.length - annotations.length;

  let summary = renderReport(report);
  if (overflow > 0) summary += `\n\n_+${overflow} more annotation(s) — see full report._\n`;

  const confirmedRisks = annotationFindings.filter(
    (f) => !("kind" in f) && f.status === "risk" && confidenceTier(f) === "confirmed",
  ).length;
  const title =
    report.verdict === "not_ready"
      ? `Not ready — ${confirmedRisks} confirmed risk(s) / scope violation(s)`
      : report.verdict === "needs_verification"
        ? "Needs verification"
        : "Ready";

  return { name: "Aker Build", conclusion: CONCLUSION[report.verdict], title, summary, annotations };
}

function isV2(report: ReviewReport | AnyReviewReport): report is ReviewReportV2 {
  return report.schema_version === 2 && "comparison" in report;
}
