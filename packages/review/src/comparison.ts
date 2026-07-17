import { createHash } from "node:crypto";
import { isAbsolute, win32 } from "node:path";
import { confidenceTier, type Finding } from "@aker-build/gates";
import { readFileSafe } from "@aker-build/scanner";
import type { ComparedGateFinding, FindingChange, FindingClassification } from "./types.js";

const CONTEXT_RADIUS = 2;
const MAX_CONTEXT_LINE_CHARS = 512;

export type SourceReader = (root: string, relativePath: string) => string | null;

export interface ClassificationInput {
  base: readonly Finding[];
  head: readonly Finding[];
  baseRoot: string;
  headRoot: string;
  lineChanged: (path: string, line: number | null) => boolean;
  readSource?: SourceReader;
}

interface FingerprintedFinding {
  finding: Finding;
  fingerprint: string;
  path: string;
  line: number | null;
  material: string;
}

/**
 * Stable comparison-only identity. This intentionally does not replace the public gates
 * `findingId`: status, severity, confidence, suppression, and line number are excluded so a
 * material edit or line move can be classified instead of appearing as remove+add.
 */
export function findingFingerprint(
  finding: Finding,
  root: string,
  readSource: SourceReader = readFileSafe,
): string {
  const first = finding.evidence[0];
  const path = normalizePath(first?.path ?? "");
  const signal = first?.signal ?? "";
  const context = sourceContext(root, path, first?.line ?? null, readSource);
  const contextDigest = sha256(context);
  return sha256(JSON.stringify([finding.gate_id, path, signal, contextDigest]));
}

/** Pair base/head finding multisets and classify every paired or unpaired member. */
export function classifyFindings(input: ClassificationInput): ComparedGateFinding[] {
  const groups = groupedFindings(input);
  return groups.fingerprints
    .flatMap((fingerprint) => classifyFingerprintGroup(input, groups.base.get(fingerprint), groups.head.get(fingerprint)))
    .sort(compareResult);
}

function groupedFindings(input: ClassificationInput): {
  base: Map<string, FingerprintedFinding[]>;
  head: Map<string, FingerprintedFinding[]>;
  fingerprints: string[];
} {
  const readSource = input.readSource ?? readFileSafe;
  const base = groupByFingerprint(input.base.map((finding) => fingerprinted(finding, input.baseRoot, readSource)));
  const head = groupByFingerprint(input.head.map((finding) => fingerprinted(finding, input.headRoot, readSource)));
  return { base, head, fingerprints: [...new Set([...base.keys(), ...head.keys()])].sort(compareText) };
}

function classifyFingerprintGroup(
  input: ClassificationInput,
  baseEntries: readonly FingerprintedFinding[] | undefined,
  headEntries: readonly FingerprintedFinding[] | undefined,
): ComparedGateFinding[] {
  const base = [...(baseEntries ?? [])].sort(compareEntry);
  const head = [...(headEntries ?? [])].sort(compareEntry);
  const pairs = pairEntries(base, head);
  return [...classifyPairs(input, pairs), ...classifyHeadEntries(input, head), ...classifyBaseEntries(base)];
}

function pairEntries(
  base: FingerprintedFinding[],
  head: FingerprintedFinding[],
): Array<[FingerprintedFinding, FingerprintedFinding]> {
  const pairs = pairExactMaterials(base, head);
  while (base.length > 0 && head.length > 0) pairs.push([base.shift()!, head.shift()!]);
  return pairs;
}

function pairExactMaterials(
  base: FingerprintedFinding[],
  head: FingerprintedFinding[],
): Array<[FingerprintedFinding, FingerprintedFinding]> {
  const pairs: Array<[FingerprintedFinding, FingerprintedFinding]> = [];
  for (let headIndex = 0; headIndex < head.length;) {
    const baseIndex = base.findIndex((entry) => entry.material === head[headIndex]!.material);
    if (baseIndex < 0) headIndex += 1;
    else pairs.push([base.splice(baseIndex, 1)[0]!, head.splice(headIndex, 1)[0]!]);
  }
  return pairs;
}

function classifyPairs(
  input: ClassificationInput,
  pairs: readonly [FingerprintedFinding, FingerprintedFinding][],
): ComparedGateFinding[] {
  return pairs.map(([base, head]) => classifiedPair(input, base, head));
}

function classifiedPair(input: ClassificationInput, base: FingerprintedFinding, head: FingerprintedFinding): ComparedGateFinding {
  const change = base.material === head.material ? undefined : changeDirection(base.finding, head.finding);
  const lineChanged = changedLine(input.lineChanged, head);
  const classification = change === "worsened" && !lineChanged ? "unattributed" : change ? "changed" : "existing";
  return withComparison(head, classification, "head", lineChanged, change);
}

function classifyHeadEntries(input: ClassificationInput, entries: readonly FingerprintedFinding[]): ComparedGateFinding[] {
  return entries.map((entry) => {
    const lineChanged = changedLine(input.lineChanged, entry);
    return withComparison(entry, lineChanged ? "new" : "unattributed", "head", lineChanged);
  });
}

function classifyBaseEntries(entries: readonly FingerprintedFinding[]): ComparedGateFinding[] {
  return entries.map((entry) => withComparison(entry, "resolved", "base", false));
}

function fingerprinted(finding: Finding, root: string, readSource: SourceReader): FingerprintedFinding {
  const first = finding.evidence[0];
  return {
    finding,
    fingerprint: findingFingerprint(finding, root, readSource),
    path: normalizePath(first?.path ?? ""),
    line: first?.line ?? null,
    material: materialSignature(finding),
  };
}

function groupByFingerprint(entries: readonly FingerprintedFinding[]): Map<string, FingerprintedFinding[]> {
  const groups = new Map<string, FingerprintedFinding[]>();
  for (const entry of entries) {
    const group = groups.get(entry.fingerprint);
    if (group) group.push(entry);
    else groups.set(entry.fingerprint, [entry]);
  }
  return groups;
}

function withComparison(
  entry: FingerprintedFinding,
  classification: FindingClassification,
  source: "base" | "head",
  lineChanged: boolean,
  change?: FindingChange,
): ComparedGateFinding {
  return {
    ...entry.finding,
    classification,
    fingerprint: entry.fingerprint,
    source,
    line_changed: lineChanged,
    ...(change ? { change } : {}),
  };
}

function sourceContext(root: string, path: string, line: number | null, readSource: SourceReader): string {
  if (!path || line == null || line < 1 || !isSafeRelativePath(path)) return "unavailable";
  let source: string | null;
  try {
    source = readSource(root, path);
  } catch {
    return "unavailable";
  }
  if (source == null) return "unavailable";
  const lines = source.replace(/\r\n?/gu, "\n").split("\n");
  const start = Math.max(0, line - 1 - CONTEXT_RADIUS);
  const end = Math.min(lines.length, line + CONTEXT_RADIUS);
  return lines.slice(start, end).map(normalizeContextLine).join("\n");
}

function normalizeContextLine(line: string): string {
  return line.trim().replace(/\s+/gu, " ").slice(0, MAX_CONTEXT_LINE_CHARS);
}

function isSafeRelativePath(path: string): boolean {
  if (isAbsolute(path) || win32.isAbsolute(path)) return false;
  return !path.split("/").some((part) => part === "..");
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function materialSignature(finding: Finding): string {
  const suppression = finding.suppression
    ? [
        finding.suppression.id,
        finding.suppression.reason,
        finding.suppression.owner,
        finding.suppression.expires ?? "",
        finding.suppression.matched_by,
      ]
    : null;
  return JSON.stringify([
    finding.status,
    finding.severity,
    confidenceTier(finding),
    suppression,
  ]);
}

function changeDirection(base: Finding, head: Finding): FindingChange {
  const deltas = [
    Number(!head.suppression) - Number(!base.suppression),
    statusRank(head) - statusRank(base),
    confidenceRank(head) - confidenceRank(base),
    severityRank(head) - severityRank(base),
  ];
  const worsened = deltas.some((delta) => delta > 0);
  const improved = deltas.some((delta) => delta < 0);
  if (worsened && !improved) return "worsened";
  if (improved && !worsened) return "improved";
  return "modified";
}

function statusRank(finding: Finding): number {
  if (finding.status === "risk") return 2;
  if (finding.status === "needs_verification") return 1;
  return 0;
}

function confidenceRank(finding: Finding): number {
  return confidenceTier(finding) === "confirmed" ? 1 : 0;
}

function severityRank(finding: Finding): number {
  if (finding.status !== "risk") return 0;
  return { low: 1, medium: 2, high: 3, critical: 4 }[finding.severity];
}

function changedLine(predicate: ClassificationInput["lineChanged"], entry: FingerprintedFinding): boolean {
  return entry.path.length > 0 && predicate(entry.path, entry.line);
}

function compareEntry(left: FingerprintedFinding, right: FingerprintedFinding): number {
  return compareText(left.path, right.path)
    || (left.line ?? Number.MAX_SAFE_INTEGER) - (right.line ?? Number.MAX_SAFE_INTEGER)
    || compareText(left.material, right.material);
}

function compareResult(left: ComparedGateFinding, right: ComparedGateFinding): number {
  const priority: Record<FindingClassification, number> = {
    new: 0,
    changed: 1,
    unattributed: 2,
    existing: 3,
    resolved: 4,
  };
  const leftFirst = left.evidence[0];
  const rightFirst = right.evidence[0];
  return priority[left.classification] - priority[right.classification]
    || compareText(left.fingerprint, right.fingerprint)
    || compareText(normalizePath(leftFirst?.path ?? ""), normalizePath(rightFirst?.path ?? ""))
    || (leftFirst?.line ?? Number.MAX_SAFE_INTEGER) - (rightFirst?.line ?? Number.MAX_SAFE_INTEGER);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
