import type { QueueItem } from "@aker-build/queue";
import {
  DEFAULT_GIT_RULES,
  DEFAULT_STOP_CONDITIONS,
  FINAL_REPORT_FIELDS,
  REPO_STATE_VERIFICATION,
} from "./defaults.js";

/** One prompt section: a heading and its body lines (shared across renderers; FR-015). */
export interface Section {
  heading: string;
  /** Body lines. Lines beginning with "- " are bullets; others are paragraphs. */
  lines: string[];
}

/** Render a list as bullets, or a "(none …)" placeholder when empty. */
function bullets(items: readonly string[], emptyNote: string): string[] {
  return items.length > 0 ? items.map((i) => `- ${i}`) : [emptyNote];
}

/**
 * Build the ten required sections (fixed order) from a real QueueItem (data-model mapping).
 * Objective ← title (no `objective` field exists). The invariant blocks come from `defaults.ts`,
 * shared verbatim so safety is identical across renderers.
 */
export function buildSections(item: QueueItem): Section[] {
  const evidenceLines = item.source.evidence.map((e) => {
    const loc = e.path ? `${e.path}${e.line != null ? `:${e.line}` : ""}` : "(no path)";
    return `- ${loc} — ${e.signal} (${e.confidence})`;
  });

  return [
    { heading: "Objective", lines: [item.title] },
    { heading: "Repo-state verification", lines: [REPO_STATE_VERIFICATION] },
    {
      heading: "Context",
      lines: evidenceLines.length > 0 ? evidenceLines : ["- (no evidence recorded for this item)"],
    },
    {
      heading: "Scope",
      lines: [
        `This is a ${item.type} task addressing: ${item.title}.`,
        `Applicable gates: ${item.gates.length > 0 ? item.gates.join(", ") : "(none)"}.`,
        "Stay strictly within the Allowed files below. Do not perform broad refactors or whole-repo changes.",
      ],
    },
    { heading: "Allowed files", lines: bullets(item.allowed_files, "- (none specified)") },
    {
      heading: "Forbidden files",
      lines: bullets(item.forbidden_files, "(none beyond the default git rules)"),
    },
    { heading: "Validation commands", lines: bullets(item.validation, "- (none specified)") },
    { heading: "Git rules", lines: bullets(DEFAULT_GIT_RULES, "") },
    {
      heading: "Stop conditions",
      // item-specific stop conditions first, then the invariant defaults (deduped, order-stable)
      lines: bullets(dedupe([...item.stop_conditions, ...DEFAULT_STOP_CONDITIONS]), ""),
    },
    {
      heading: "Final report format",
      lines: bullets(
        item.final_report.required.length > 0 ? item.final_report.required : FINAL_REPORT_FIELDS,
        "",
      ),
    },
  ];
}

function dedupe(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    if (!seen.has(x)) {
      seen.add(x);
      out.push(x);
    }
  }
  return out;
}
