import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";

const SOURCE_EXT = /\.(ts|js|tsx|jsx|py|go|rb)$/;
// Ordered: first match per line wins, so a line is one signal.
const SURFACE_PATTERNS: { re: RegExp; signal: string }[] = [
  { re: /\bprocess\.env\.\w+/, signal: "env_var_use" },
  { re: /\b(stripe|paddle|chargebee)\.[\w.]*\b|\b(charge|invoice|subscription|usageRecord)s?\b/i, signal: "billing_hook" },
  { re: /\b(logger|log|metrics|tracer)\.\w+\s*\(|\bconsole\.(log|info|warn|error)\s*\(/, signal: "log_emit" },
];

/**
 * Detect config/billing/observability surface as Evidence (medium confidence — these are
 * heuristic name-based signals). Read-only: env_var_use, billing_hook, log_emit. NEVER copies the
 * env var name or value into the evidence. Sorted by path then line. Honesty: none -> empty array.
 */
export function detectConfigSurface(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_EXT.test(rel)) continue;
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      const matched = SURFACE_PATTERNS.find((p) => p.re.test(text));
      if (!matched) continue;
      out.push({ type: "line", path: rel, line: i + 1, signal: matched.signal, confidence: "medium" });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
