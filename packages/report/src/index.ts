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

function summarizeQueue(queue: Queue | null): AkerBuildReport["summary"]["queue"] {
  const items = queue?.items ?? [];
  return {
    total: items.length,
    ready: items.filter((item) => item.status === "ready").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    done: items.filter((item) => item.status === "done").length,
  };
}

function summarizeRoute(route: RouterDecision | null): AkerBuildReport["summary"]["route"] {
  return {
    next_id: route?.next?.id ?? null,
    blocked: route?.blocked.length ?? 0,
    no_safe_task_reasons: route?.no_safe_task_reasons ?? [],
  };
}

function summarizeReview(review: ReviewReport | null): AkerBuildReport["summary"]["review"] {
  if (!review) return null;
  return {
    verdict: review.verdict,
    changed_files: review.changed_files.length,
    findings: review.findings.length,
  };
}

function summarizeReport(artifacts: LoadedArtifacts): AkerBuildReport["summary"] {
  return {
    project_name: artifacts.projectMap?.project.name ?? null,
    repo_count: artifacts.projectMap?.repos.length ?? 0,
    tenant_status: artifacts.projectMap?.tenant_model.status ?? null,
    coverage: artifacts.projectMap?.coverage ?? null,
    findings: summarizeFindings(artifacts.risks),
    queue: summarizeQueue(artifacts.queue),
    route: summarizeRoute(artifacts.route),
    review: summarizeReview(artifacts.review),
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
    summary: summarizeReport(artifacts),
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

function reportHeader(report: AkerBuildReport): string[] {
  return [
    "# Aker Build Report",
    "",
    `Project: ${report.summary.project_name ?? "(unknown)"}`,
    `Tenant model: ${report.summary.tenant_status ?? "(unknown)"}`,
    `Repos: ${report.summary.repo_count}`,
    "",
  ];
}

function coverageSection(report: AkerBuildReport): string[] {
  const lines = ["## Framework Coverage"];
  const coverage = report.summary.coverage;
  if (coverage === null) {
    return [...lines, "Coverage evidence is unavailable in this legacy Project Map; a clean finding set does not establish framework coverage.", ""];
  }
  lines.push(`Source files examined: ${coverage.source_files_examined}`);
  if (coverage.packs.length === 0) {
    return [...lines, "No framework signature pack matched; a clean finding set does not establish framework coverage.", ""];
  }
  lines.push("Recognized signature packs:");
  for (const pack of coverage.packs) {
    lines.push(`- ${pack.id} (${pack.capabilities.join(", ")}; ${pack.matched_files} matched files)`);
  }
  lines.push("Signature recognition is not proof of complete framework or repository coverage.", "");
  return lines;
}

function formatList(values: readonly string[]): string {
  return values.length > 0 ? values.join(", ") : "(none)";
}

function artifactsSection(report: AkerBuildReport): string[] {
  return [
    "## Artifacts",
    `Present: ${formatList(report.artifacts.present)}`,
    `Missing artifacts: ${formatList(report.artifacts.missing)}`,
    "",
  ];
}

function findingsSection(report: AkerBuildReport): string[] {
  const findings = report.summary.findings;
  return [
    "## Findings",
    `Total: ${findings.total} · Risk: ${findings.risk} · Needs verification: ${findings.needs_verification} · Suppressed: ${findings.suppressed}`,
    `Severity: critical ${findings.by_severity.critical}, high ${findings.by_severity.high}, medium ${findings.by_severity.medium}, low ${findings.by_severity.low}`,
    "",
  ];
}

function queueSection(report: AkerBuildReport): string[] {
  const queue = report.summary.queue;
  const lines = [
    "## Queue And Route",
    `Queue: ${queue.total} total, ${queue.ready} ready, ${queue.blocked} blocked, ${queue.done} done`,
    `Next: ${report.summary.route.next_id ?? "(none)"}`,
  ];
  for (const reason of report.summary.route.no_safe_task_reasons) lines.push(`- ${reason}`);
  lines.push("");
  return lines;
}

function reviewSection(report: AkerBuildReport): string[] {
  const review = report.summary.review;
  if (!review) return ["## Review", "(no review artifact)", ""];
  return [
    "## Review",
    `Verdict: ${review.verdict}`,
    `Changed files: ${review.changed_files}`,
    `Findings: ${review.findings}`,
    "",
  ];
}

function suppressionsSection(report: AkerBuildReport): string[] {
  const lines = ["## Suppressions"];
  if (report.suppressions.length === 0) return [...lines, "(none)", ""];
  for (const suppression of report.suppressions) {
    const severity = suppression.severity ? `, ${suppression.severity}` : "";
    lines.push(`- ${suppression.id} (${suppression.gate_id}, ${suppression.finding_status}${severity}) — ${suppression.reason} [owner: ${suppression.owner}]`);
  }
  lines.push("");
  return lines;
}

function configSection(report: AkerBuildReport): string[] {
  const lines = ["## Config And Spec Kit", `Config: ${report.config.path ?? "(none)"}`];
  if (report.config.error) lines.push(`Config warning: ${report.config.error}`);
  lines.push(`Configured suppressions: ${report.config.suppressions_configured}`);
  lines.push(`Spec Kit artifacts: ${report.spec_kit.artifact_count}`);
  if (report.spec_kit.secret_like_count > 0) {
    lines.push(`Spec Kit secret-like artifacts: ${report.spec_kit.secret_like_count} (values not captured)`);
  }
  lines.push("");
  return lines;
}

export function renderReportMarkdown(report: AkerBuildReport): string {
  return [
    ...reportHeader(report),
    ...coverageSection(report),
    ...artifactsSection(report),
    ...findingsSection(report),
    ...queueSection(report),
    ...reviewSection(report),
    ...suppressionsSection(report),
    ...configSection(report),
  ].join("\n");
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
