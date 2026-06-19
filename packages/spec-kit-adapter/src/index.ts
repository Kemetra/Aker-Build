import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { Evidence } from "@tenantguard/project-map";

export type SpecKitArtifactKind = "constitution" | "spec" | "plan" | "tasks" | "checklist";

export interface SpecKitArtifact {
  kind: SpecKitArtifactKind;
  path: string;
  summary: string;
  secretLike: boolean;
}

export interface SpecKitContext {
  present: boolean;
  artifacts: SpecKitArtifact[];
  evidence: Evidence[];
}

const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----/,
  /["']?(secret|password|token|api[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i,
];

export function readSpecKitArtifacts(repoRoot: string): SpecKitContext {
  const candidates = discoverCandidates(repoRoot);
  const artifacts = candidates.map(({ kind, path }) => readArtifact(repoRoot, path, kind));
  const evidence: Evidence[] = artifacts.map((artifact) => ({
    type: "file",
    path: artifact.path,
    line: null,
    signal: artifact.secretLike
      ? `Spec Kit artifact: ${artifact.kind} (secret-like content detected; value not captured)`
      : `Spec Kit artifact: ${artifact.kind}`,
    confidence: "medium",
  }));

  return {
    present: artifacts.length > 0,
    artifacts,
    evidence,
  };
}

function discoverCandidates(repoRoot: string): { kind: SpecKitArtifactKind; path: string }[] {
  const candidates: { kind: SpecKitArtifactKind; path: string }[] = [];
  addIfFile(candidates, repoRoot, ".specify/memory/constitution.md", "constitution");
  addIfFile(candidates, repoRoot, "spec.md", "spec");
  addIfFile(candidates, repoRoot, "plan.md", "plan");
  addIfFile(candidates, repoRoot, "tasks.md", "tasks");
  addChecklists(candidates, repoRoot, "checklists");

  const specsRoot = join(repoRoot, "specs");
  if (existsSync(specsRoot)) {
    for (const entry of readdirSync(specsRoot, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue;
      const base = `specs/${entry.name}`;
      addIfFile(candidates, repoRoot, `${base}/spec.md`, "spec");
      addIfFile(candidates, repoRoot, `${base}/plan.md`, "plan");
      addIfFile(candidates, repoRoot, `${base}/tasks.md`, "tasks");
      addChecklists(candidates, repoRoot, `${base}/checklists`);
    }
  }

  return candidates.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
}

function addIfFile(
  candidates: { kind: SpecKitArtifactKind; path: string }[],
  repoRoot: string,
  path: string,
  kind: SpecKitArtifactKind,
): void {
  if (existsSync(join(repoRoot, path))) candidates.push({ kind, path });
}

function addChecklists(
  candidates: { kind: SpecKitArtifactKind; path: string }[],
  repoRoot: string,
  relDir: string,
): void {
  const abs = join(repoRoot, relDir);
  if (!existsSync(abs)) return;
  for (const file of listMarkdown(abs)) {
    candidates.push({ kind: "checklist", path: relative(repoRoot, file).split(sep).join("/") });
  }
}

function listMarkdown(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listMarkdown(abs));
    else if (entry.isFile() && entry.name.endsWith(".md")) out.push(abs);
  }
  return out;
}

function readArtifact(repoRoot: string, path: string, kind: SpecKitArtifactKind): SpecKitArtifact {
  const raw = readFileSync(join(repoRoot, path), "utf8");
  const secretLike = SECRET_PATTERNS.some((pattern) => pattern.test(raw));
  return {
    kind,
    path,
    secretLike,
    summary: secretLike ? "secret-like content detected (value not captured)" : summarize(raw, kind),
  };
}

function summarize(raw: string, kind: SpecKitArtifactKind): string {
  const firstHeading = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstHeading ? firstHeading.replace(/^#+\s*/, "") : `Spec Kit ${kind} artifact`;
}
