import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadConfig } from "@aker-build/config";
import { validate as validateProjectMap, type ProjectMap } from "@aker-build/project-map";
import { validateRisks, type Finding, type RiskList } from "@aker-build/gates";
import { validateQueue, validateRouteDecision, type Queue, type RouterDecision } from "@aker-build/queue";
import { validateReview } from "@aker-build/review";
import type { ReviewReport } from "@aker-build/review";
import { writeOutput } from "@aker-build/scanner";
import { readSpecKitArtifacts } from "@aker-build/spec-kit-adapter";
import { REPORT_SCHEMA_VERSION, validateReport } from "./schema.js";
import type { ReportOptions, AkerBuildReport, WrittenReport } from "./types.js";

const DEFAULT_OUT = ".aker-build";
const REPORT_JSON = "aker-build-report.json";
const REPORT_MD = "aker-build-report.md";
const ARTIFACTS = ["project-map.json", "risks.json", "queue.json", "route.json", "review.json"] as const;

export class InvalidReportError extends Error {}
export class InvalidReportInputError extends Error {}

type ArtifactName = (typeof ARTIFACTS)[number];

interface LoadedArtifacts {
  present: ArtifactName[];
  missing: ArtifactName[];
  projectMap: ProjectMap | null;
  risks: RiskList | null;
  queue: Queue | null;
  route: RouterDecision | null;
  review: ReviewReport | null;
}

function readJsonIfPresent(outDir: string, name: ArtifactName): unknown | null {
  const path = resolve(outDir, name);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8"));
}

function validationError(name: ArtifactName, errors: { path: string; message: string }[]): InvalidReportInputError {
  return new InvalidReportInputError(
    `${name} failed schema validation: ${errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ")}`,
  );
}

function loadArtifacts(outDir: string): LoadedArtifacts {
  const present: ArtifactName[] = [];
  const missing: ArtifactName[] = [];
  for (const name of ARTIFACTS) {
    if (existsSync(resolve(outDir, name))) present.push(name);
    else missing.push(name);
  }

  const projectMapRaw = readJsonIfPresent(outDir, "project-map.json");
  const risksRaw = readJsonIfPresent(outDir, "risks.json");
  const queueRaw = readJsonIfPresent(outDir, "queue.json");
  const routeRaw = readJsonIfPresent(outDir, "route.json");
  const reviewRaw = readJsonIfPresent(outDir, "review.json");

  if (projectMapRaw) {
    const result = validateProjectMap(projectMapRaw);
    if (!result.ok) throw validationError("project-map.json", result.errors);
  }
  if (risksRaw) {
    const result = validateRisks(risksRaw);
    if (!result.ok) throw validationError("risks.json", result.errors);
  }
  if (queueRaw) {
    const result = validateQueue(queueRaw);
    if (!result.ok) throw validationError("queue.json", result.errors);
  }
  if (routeRaw) {
    const result = validateRouteDecision(routeRaw);
    if (!result.ok) throw validationError("route.json", result.errors);
  }
  if (reviewRaw) {
    const result = validateReview(reviewRaw);
    if (!result.ok) throw validationError("review.json", result.errors);
  }

  return {
    present,
    missing,
    projectMap: projectMapRaw as ProjectMap | null,
    risks: risksRaw as RiskList | null,
    queue: queueRaw as Queue | null,
    route: routeRaw as RouterDecision | null,
    review: reviewRaw as ReviewReport | null,
  };
}

function summarizeConfig(repoRoot: string): AkerBuildReport["config"] {
  try {
    const loaded = loadConfig(repoRoot);
    const config = loaded.config;
    const suppressions = Object.values(config.gates ?? {}).reduce((sum, gate) => sum + (gate.suppressions?.length ?? 0), 0);
    return {
      path: loaded.path,
      ...(config.project?.name ? { project_name: config.project.name } : {}),
      ...(config.project?.type ? { project_type: config.project.type } : {}),
      ...(config.paths?.include ? { include: config.paths.include } : {}),
      ...(config.paths?.exclude ? { exclude: config.paths.exclude } : {}),
      suppressions_configured: suppressions,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      path: null,
      suppressions_configured: 0,
      error: message,
    };
  }
}

function severityOf(finding: Finding): "low" | "medium" | "high" | "critical" | null {
  return finding.status === "risk" ? finding.severity : null;
}

function summarizeSuppressions(risks: RiskList | null): AkerBuildReport["suppressions"] {
  if (!risks) return [];
  return risks.findings
    .filter((finding) => finding.suppression)
    .map((finding) => {
      const suppression = finding.suppression!;
      return {
        gate_id: finding.gate_id,
        finding_status: finding.status,
        severity: severityOf(finding),
        id: suppression.id,
        reason: suppression.reason,
        owner: suppression.owner,
        ...(suppression.expires ? { expires: suppression.expires } : {}),
        matched_by: suppression.matched_by,
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.gate_id.localeCompare(b.gate_id)));
}

function summarizeFindings(risks: RiskList | null): AkerBuildReport["summary"]["findings"] {
  const findings = risks?.findings ?? [];
  return {
    total: findings.length,
    risk: findings.filter((f) => f.status === "risk").length,
    needs_verification: findings.filter((f) => f.status === "needs_verification").length,
    not_applicable: findings.filter((f) => f.status === "not_applicable").length,
    suppressed: findings.filter((f) => f.suppression).length,
    by_severity: {
      low: findings.filter((f) => f.status === "risk" && f.severity === "low").length,
      medium: findings.filter((f) => f.status === "risk" && f.severity === "medium").length,
      high: findings.filter((f) => f.status === "risk" && f.severity === "high").length,
      critical: findings.filter((f) => f.status === "risk" && f.severity === "critical").length,
    },
  };
}

function buildReportUnchecked(repoRoot: string, outDir: string): AkerBuildReport {
  const artifacts = loadArtifacts(outDir);
  const specKit = readSpecKitArtifacts(repoRoot);

  return {
    schema_version: REPORT_SCHEMA_VERSION,
    artifacts: {
      present: artifacts.present,
      missing: artifacts.missing,
    },
    config: summarizeConfig(repoRoot),
    spec_kit: {
      present: specKit.present,
      artifact_count: specKit.artifacts.length,
      evidence_count: specKit.evidence.length,
      secret_like_count: specKit.artifacts.filter((artifact) => artifact.secretLike).length,
    },
    summary: {
      project_name: artifacts.projectMap?.project.name ?? null,
      repo_count: artifacts.projectMap?.repos.length ?? 0,
      tenant_status: artifacts.projectMap?.tenant_model.status ?? null,
      coverage: artifacts.projectMap?.coverage ?? null,
      findings: summarizeFindings(artifacts.risks),
      queue: {
        total: artifacts.queue?.items.length ?? 0,
        ready: artifacts.queue?.items.filter((item) => item.status === "ready").length ?? 0,
        blocked: artifacts.queue?.items.filter((item) => item.status === "blocked").length ?? 0,
        done: artifacts.queue?.items.filter((item) => item.status === "done").length ?? 0,
      },
      route: {
        next_id: artifacts.route?.next?.id ?? null,
        blocked: artifacts.route?.blocked.length ?? 0,
        no_safe_task_reasons: artifacts.route?.no_safe_task_reasons ?? [],
      },
      review: artifacts.review
        ? {
            verdict: artifacts.review.verdict,
            changed_files: artifacts.review.changed_files.length,
            findings: artifacts.review.findings.length,
          }
        : null,
    },
    suppressions: summarizeSuppressions(artifacts.risks),
  };
}

export function buildReport(targetPath: string, opts: ReportOptions = {}): AkerBuildReport {
  const out = resolve(opts.out ?? DEFAULT_OUT);
  const report = buildReportUnchecked(resolve(targetPath), out);
  const result = validateReport(report);
  if (!result.ok) {
    throw new InvalidReportError(
      `produced aker-build-report.json failed schema validation: ${result.errors.map((e) => `${e.path || "(root)"}: ${e.message}`).join("; ")}`,
    );
  }
  return report;
}

export function renderReportMarkdown(report: AkerBuildReport): string {
  const lines: string[] = [];
  lines.push("# Aker Build Report");
  lines.push("");
  lines.push(`Project: ${report.summary.project_name ?? "(unknown)"}`);
  lines.push(`Tenant model: ${report.summary.tenant_status ?? "(unknown)"}`);
  lines.push(`Repos: ${report.summary.repo_count}`);
  lines.push("");
  lines.push("## Framework Coverage");
  if (report.summary.coverage === null) {
    lines.push("Coverage evidence is unavailable in this legacy Project Map; a clean finding set does not establish framework coverage.");
  } else if (report.summary.coverage.packs.length === 0) {
    lines.push(`Source files examined: ${report.summary.coverage.source_files_examined}`);
    lines.push("No framework signature pack matched; a clean finding set does not establish framework coverage.");
  } else {
    lines.push(`Source files examined: ${report.summary.coverage.source_files_examined}`);
    lines.push("Recognized signature packs:");
    for (const pack of report.summary.coverage.packs) {
      lines.push(`- ${pack.id} (${pack.capabilities.join(", ")}; ${pack.matched_files} matched files)`);
    }
    lines.push("Signature recognition is not proof of complete framework or repository coverage.");
  }
  lines.push("");
  lines.push("## Artifacts");
  lines.push(`Present: ${report.artifacts.present.length > 0 ? report.artifacts.present.join(", ") : "(none)"}`);
  lines.push(`Missing artifacts: ${report.artifacts.missing.length > 0 ? report.artifacts.missing.join(", ") : "(none)"}`);
  lines.push("");
  lines.push("## Findings");
  lines.push(
    `Total: ${report.summary.findings.total} · Risk: ${report.summary.findings.risk} · Needs verification: ${report.summary.findings.needs_verification} · Suppressed: ${report.summary.findings.suppressed}`,
  );
  lines.push(
    `Severity: critical ${report.summary.findings.by_severity.critical}, high ${report.summary.findings.by_severity.high}, medium ${report.summary.findings.by_severity.medium}, low ${report.summary.findings.by_severity.low}`,
  );
  lines.push("");
  lines.push("## Queue And Route");
  lines.push(`Queue: ${report.summary.queue.total} total, ${report.summary.queue.ready} ready, ${report.summary.queue.blocked} blocked, ${report.summary.queue.done} done`);
  lines.push(`Next: ${report.summary.route.next_id ?? "(none)"}`);
  if (report.summary.route.no_safe_task_reasons.length > 0) {
    for (const reason of report.summary.route.no_safe_task_reasons) lines.push(`- ${reason}`);
  }
  lines.push("");
  lines.push("## Review");
  if (report.summary.review) {
    lines.push(`Verdict: ${report.summary.review.verdict}`);
    lines.push(`Changed files: ${report.summary.review.changed_files}`);
    lines.push(`Findings: ${report.summary.review.findings}`);
  } else {
    lines.push("(no review artifact)");
  }
  lines.push("");
  lines.push("## Suppressions");
  if (report.suppressions.length === 0) {
    lines.push("(none)");
  } else {
    for (const suppression of report.suppressions) {
      const severity = suppression.severity ? `, ${suppression.severity}` : "";
      lines.push(`- ${suppression.id} (${suppression.gate_id}, ${suppression.finding_status}${severity}) — ${suppression.reason} [owner: ${suppression.owner}]`);
    }
  }
  lines.push("");
  lines.push("## Config And Spec Kit");
  lines.push(`Config: ${report.config.path ?? "(none)"}`);
  if (report.config.error) lines.push(`Config warning: ${report.config.error}`);
  lines.push(`Configured suppressions: ${report.config.suppressions_configured}`);
  lines.push(`Spec Kit artifacts: ${report.spec_kit.artifact_count}`);
  if (report.spec_kit.secret_like_count > 0) {
    lines.push(`Spec Kit secret-like artifacts: ${report.spec_kit.secret_like_count} (values not captured)`);
  }
  lines.push("");
  return lines.join("\n");
}

export function writeReportToFiles(targetPath: string, opts: ReportOptions = {}): WrittenReport {
  const out = opts.out ?? DEFAULT_OUT;
  const report = buildReport(targetPath, opts);
  const jsonPath = writeOutput(out, REPORT_JSON, JSON.stringify(report, null, 2) + "\n");
  const mdPath = writeOutput(out, REPORT_MD, renderReportMarkdown(report));
  return { jsonPath, mdPath, report };
}

export { validateReport, reportSchema, REPORT_SCHEMA_VERSION } from "./schema.js";
export type { AkerBuildReport, ReportOptions, WrittenReport } from "./types.js";
