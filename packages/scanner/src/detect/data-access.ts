import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";
import { matchingSignaturePacks, SOURCE_FILE, stripComments } from "./signature-packs.js";

// A tenant-id token scoping the statement.
const TENANT_TOKEN = /\btenant_?id\b|\borg_?id\b|\baccount_?id\b/i;

// Statement window: the match line plus the next 5 lines (multi-line builder calls put the
// `where:` clause below the call). A regex window can neither prove presence robustly nor prove
// absence, so every window-based classification is emitted at medium confidence; only a
// same-line tenant token is high.
const WINDOW_LINES = 5;

/**
 * Detect database access sites as normative Evidence. Read-only: records WHERE a query happens
 * and encodes tenant-scoping in the signal ("tenant_scoped" vs "no_tenant_filter"). Never judges
 * and never stores a value. Returned sorted by path then line (determinism). Honesty: no sites
 * -> empty array.
 */
export function detectDataAccess(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_FILE.test(rel)) continue;
    const rawContent = readFileSafe(root, rel);
    if (rawContent === null) continue;
    const content = stripComments(rawContent);
    const dataPacks = matchingSignaturePacks(rel, content).filter((pack) => pack.dataAccess);
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      if (!dataPacks.some((pack) => pack.dataAccess?.query.test(text))) continue;
      if (TENANT_TOKEN.test(text)) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "tenant_scoped", confidence: "high" });
        continue;
      }
      const window = lines.slice(i + 1, i + 1 + WINDOW_LINES).join("\n");
      out.push({
        type: "line",
        path: rel,
        line: i + 1,
        signal: TENANT_TOKEN.test(window) ? "tenant_scoped" : "no_tenant_filter",
        confidence: "medium",
      });
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
