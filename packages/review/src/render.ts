import type {
  AnyReviewReport,
  ReviewReport,
  ReviewReportV2,
  ReviewFinding,
  ReviewFindingV2,
  ComparedGateFinding,
  Verdict,
} from "./types.js";

const VERDICT_LABEL: Record<Verdict, string> = {
  ready: "Ready",
  not_ready: "Not Ready",
  needs_verification: "Needs Verification",
};

const VERDICT_REASON: Record<Verdict, string> = {
  ready: "no diff-attributable risk findings and no scope violations.",
  not_ready: "a diff-attributable risk finding or out-of-scope change blocks merge-readiness.",
  needs_verification: "a diff-attributable check could not be confirmed; evidence is insufficient.",
};

/**
 * Render a human-readable Markdown report (FR-013). Fixed section order → deterministic (SC-007).
 * Surfaces each finding's gate id + evidence `signal`/`path`/`line` — never a raw secret value
 * (FR-009; the evidence is already secret-safe upstream). Never instructs commit/push/merge (FR-008).
 */
export function renderReport(report: ReviewReport | AnyReviewReport): string {
  const lines: string[] = [];
  lines.push(`# Review: ${VERDICT_LABEL[report.verdict]}`);
  lines.push("");

  const itemPart = report.scope.checked ? ` · **Item:** ${report.scope.item_id}` : "";
  lines.push(`**Mode:** ${report.mode}${itemPart} · **Changed files:** ${report.changed_files.length}`);
  if (report.pr) {
    lines.push("");
    lines.push(`**PR #${report.pr.number}:** ${report.pr.title} (${report.pr.state}, base \`${report.pr.base_ref}\`)`);
  }
  lines.push("");

  if (isV2(report)) {
    renderComparisonSections(lines, report);
  } else {
    lines.push("## Contributing findings");
    if (report.findings.length === 0) {
      lines.push("(none attributable to this diff)");
    } else {
      for (const f of report.findings) lines.push(...renderFinding(f));
    }
    lines.push("");
  }

  lines.push("## Scope");
  if (!report.scope.checked) {
    lines.push("No scope checked (no `--item` supplied).");
  } else if (report.scope.violations.length === 0) {
    lines.push(`Checked against ${report.scope.item_id} — no out-of-scope changes.`);
  } else {
    lines.push(`Checked against ${report.scope.item_id} — out-of-scope changes:`);
    for (const v of report.scope.violations) {
      lines.push(`- \`${v.file}\` — ${v.reason === "forbidden" ? "forbidden file" : "outside allowed files"}`);
    }
  }
  lines.push("");

  lines.push("## Changed files");
  if (report.changed_files.length === 0) lines.push("(none)");
  else for (const file of report.changed_files) lines.push(`- \`${file}\``);
  lines.push("");

  lines.push("## Verdict");
  lines.push(`**${VERDICT_LABEL[report.verdict]}** — ${VERDICT_REASON[report.verdict]}`);
  lines.push("");

  return lines.join("\n");
}

function renderComparisonSections(lines: string[], report: ReviewReportV2): void {
  const baseSha = report.comparison.base.sha?.slice(0, 12) ?? "uncommitted";
  const headSha = report.comparison.head.sha?.slice(0, 12) ?? "uncommitted";
  lines.push("## Comparison");
  lines.push(`\`${report.comparison.base.label}\` (${baseSha}) → \`${report.comparison.head.label}\` (${headSha})`);
  lines.push(`Complete: **${report.comparison.complete ? "yes" : "no"}**`);
  if (report.comparison.incomplete_reasons.length > 0) {
    lines.push(`Incomplete reasons: ${report.comparison.incomplete_reasons.map((reason) => `\`${reason}\``).join(", ")}`);
  }
  lines.push("");

  const gateFindings = report.findings.filter(isComparedGateFinding);
  renderV2Section(
    lines,
    "Introduced or worsened",
    gateFindings.filter((finding) => finding.classification === "new"
      || (finding.classification === "changed" && finding.change === "worsened")),
  );
  renderV2Section(lines, "Existing debt", gateFindings.filter((finding) => finding.classification === "existing"));
  renderV2Section(
    lines,
    "Resolved or improved",
    gateFindings.filter((finding) => finding.classification === "resolved"
      || (finding.classification === "changed" && finding.change === "improved")),
  );
  renderV2Section(lines, "Needs attribution", gateFindings.filter((finding) => finding.classification === "unattributed"));
  const modified = gateFindings.filter((finding) => finding.classification === "changed" && finding.change === "modified");
  if (modified.length > 0) renderV2Section(lines, "Other material changes", modified);
}

function renderV2Section(lines: string[], title: string, findings: readonly ComparedGateFinding[]): void {
  lines.push(`## ${title}`);
  if (findings.length === 0) lines.push("(none)");
  else for (const finding of findings) lines.push(...renderFinding(finding));
  lines.push("");
}

function renderFinding(f: ReviewFinding | ReviewFindingV2): string[] {
  if ("kind" in f) {
    return [`- **scope** — \`${f.file}\` is ${f.reason === "forbidden" ? "forbidden" : "outside allowed files"} for ${f.item_id}`];
  }
  const sev = f.severity ? `, ${f.severity}` : "";
  const comparison = "classification" in f
    ? ` · ${f.classification}${f.change ? `/${f.change}` : ""}${f.suppression ? " · suppressed" : ""}`
    : "";
  const out = [`- **${f.gate_id}** (${f.status}${sev})${comparison}`];
  for (const e of f.evidence) {
    const loc = e.line != null ? `${e.path ?? "(no path)"}:${e.line}` : (e.path ?? "(no path)");
    out.push(`  - \`${loc}\` — ${e.signal}`);
  }
  return out;
}

function isV2(report: ReviewReport | AnyReviewReport): report is ReviewReportV2 {
  return report.schema_version === 2 && "comparison" in report;
}

function isComparedGateFinding(finding: ReviewFindingV2): finding is ComparedGateFinding {
  return !("kind" in finding);
}
