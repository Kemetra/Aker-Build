import type { Evidence } from "@tenantguard/project-map";
import type { Finding, GateContext, Severity } from "../types.js";

/** Build a `risk` finding with one or more evidence objects. */
export function risk(gateId: string, severity: Severity, evidence: Evidence[]): Finding {
  return { gate_id: gateId, status: "risk", severity, evidence };
}

/** Build a `needs_verification` finding (severity null; >=1 evidence required). */
export function needsVerification(gateId: string, evidence: Evidence[]): Finding {
  return { gate_id: gateId, status: "needs_verification", severity: null, evidence };
}

/** Build a `not_applicable` finding (severity null; evidence optional). */
export function notApplicable(gateId: string, evidence: Evidence[] = []): Finding {
  return { gate_id: gateId, status: "not_applicable", severity: null, evidence };
}

/** A `file` evidence object. */
export function fileEvidence(
  path: string,
  signal: string,
  confidence: Evidence["confidence"] = "medium",
): Evidence {
  return { type: "file", path, line: null, signal, confidence };
}

/** A `line` evidence object pointing at a specific line. */
export function lineEvidence(
  path: string,
  line: number,
  signal: string,
  confidence: Evidence["confidence"] = "medium",
): Evidence {
  return { type: "line", path, line, signal, confidence };
}

/** A `missing_artifact` evidence object (path may be null when nothing concrete exists). */
export function missingEvidence(
  path: string | null,
  signal: string,
  confidence: Evidence["confidence"] = "low",
): Evidence {
  return { type: "missing_artifact", path, line: null, signal, confidence };
}

/** Source-code file extensions a gate inspects (keeps scanning cheap and deterministic). */
const SOURCE_EXTS = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts"];

/** List source files under the repo (sorted, read-only). */
export function sourceFiles(ctx: GateContext): string[] {
  return ctx
    .listFiles(ctx.repoRoot)
    .filter((f) => SOURCE_EXTS.some((ext) => f.endsWith(ext)))
    .sort();
}

/** Read a repo-relative file; "" if unreadable (keeps gate logic branch-free). */
export function read(ctx: GateContext, rel: string): string {
  return ctx.readFileSafe(ctx.repoRoot, rel) ?? "";
}

/**
 * Strip line (`//…`) and block (`/* … *​/`) comments, replacing each with a space so line numbers
 * are preserved. v0 gates match against CODE, not comments — a comment saying "no billing surface"
 * must not register as a billing signal. Not string-literal aware (full tokenizing is post-v0).
 */
export function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));
}

/** Read a file with comments stripped (code-only matching). "" if unreadable. */
export function readCode(ctx: GateContext, rel: string): string {
  return stripComments(read(ctx, rel));
}

/**
 * Find the 1-based line numbers in `content` whose text matches `re`.
 * Used to attach precise `line` evidence without copying the matched text wholesale.
 */
export function matchingLines(content: string, re: RegExp): number[] {
  const out: number[] = [];
  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? "";
    if (re.test(line)) out.push(i + 1);
  }
  return out;
}
