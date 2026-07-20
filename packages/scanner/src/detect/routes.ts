import { readFileSafe } from "../io.js";
import type { Evidence } from "@aker-build/project-map";
import { matchingSignaturePacks, SOURCE_FILE, stripComments } from "./signature-packs.js";

/**
 * Detect API route definitions as Evidence. Read-only: one route_definition per matched line, plus
 * a route_admin signal when the line targets an /admin path. Never judges (a missing auth guard is
 * G4's call, not this detector's). Sorted by path then line. Honesty: no routes -> empty array.
 */
export function detectRoutes(root: string, files: string[]): Evidence[] {
  const out: Evidence[] = [];
  for (const rel of files) {
    if (!SOURCE_FILE.test(rel)) continue;
    const rawContent = readFileSafe(root, rel);
    if (rawContent === null) continue;
    const content = stripComments(rawContent);
    const routePacks = matchingSignaturePacks(rel, content).filter((pack) => pack.routes);
    const lines = content.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const text = lines[i] ?? "";
      const matchingPacks = routePacks.filter((pack) => pack.routes?.definition.test(text));
      if (matchingPacks.length === 0) continue;
      out.push({ type: "line", path: rel, line: i + 1, signal: "route_definition", confidence: "high" });
      if (matchingPacks.some((pack) =>
        (pack.routes?.admin?.test(text) ?? false) || (pack.routes?.adminPath?.test(rel) ?? false),
      )) {
        out.push({ type: "line", path: rel, line: i + 1, signal: "route_admin", confidence: "high" });
      }
    }
  }
  out.sort((a, b) =>
    a.path === b.path ? (a.line ?? 0) - (b.line ?? 0) : (a.path ?? "") < (b.path ?? "") ? -1 : 1,
  );
  return out;
}
