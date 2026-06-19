import type { Finding } from "@tenantguard/gates";
import type { QueueContext, QueueItem, QueueItemType, Level } from "./types.js";

/** Map a gate id to the kind of work a fix would be. */
function typeForGate(gateId: string): QueueItemType {
  switch (gateId) {
    case "TG-G3":
      return "migration";
    case "TG-G2":
      return "test";
    case "TG-G7":
      return "docs";
    case "TG-G8":
      return "chore";
    default:
      return "implementation";
  }
}

/** Severity → priority/risk level (1:1; a risk finding's severity drives both). */
function levelForSeverity(sev: string | null): Level {
  switch (sev) {
    case "critical":
      return "critical";
    case "high":
      return "high";
    case "medium":
      return "medium";
    default:
      return "low";
  }
}

/** Default validation commands every item should run. */
const DEFAULT_VALIDATION = ["pnpm -r test", "pnpm -r typecheck"];
const DEFAULT_FINAL_REPORT = [
  "files changed",
  "summary of changes",
  "tests run and results",
  "evidence used",
  "git status",
  "next safe action",
];

/** Distinct evidence paths (sorted) — used to seed lock scope / allowed files deterministically. */
function evidencePaths(f: Finding): string[] {
  const paths = f.evidence.map((e) => e.path).filter((p): p is string => !!p);
  return [...new Set(paths)].sort();
}

/**
 * Derive queue items from the risk list. Each `risk` finding → one item; each `needs_verification`
 * finding → a `blocked` item (no safe scoped action yet, US1 #3); `not_applicable` → nothing.
 * Item ids are stable within a run (Q-001, Q-002, … in canonical finding order).
 */
export function deriveItems(ctx: QueueContext): QueueItem[] {
  const findings = ctx.risks.findings.filter(
    (f) => (f.status === "risk" || f.status === "needs_verification") && !f.suppression,
  );
  const specEvidence = ctx.specKit?.evidence ?? [];

  const items: QueueItem[] = findings.map((f, i) => {
    const id = `Q-${String(i + 1).padStart(3, "0")}`;
    const paths = evidencePaths(f);
    const sig = f.evidence[0]?.signal ?? f.gate_id;
    const isRisk = f.status === "risk";
    const level = levelForSeverity(f.severity);

    return {
      id,
      title: isRisk ? `Fix: ${sig}` : `Verify: ${sig}`,
      status: isRisk ? "ready" : "blocked",
      type: typeForGate(f.gate_id),
      source: { evidence: [...f.evidence, ...specEvidence] },
      priority: isRisk ? level : "low",
      risk: isRisk ? level : "low",
      depends_on: [],
      lock_scope: { files: paths },
      allowed_files: paths,
      forbidden_files: [],
      gates: [f.gate_id],
      validation: DEFAULT_VALIDATION,
      stop_conditions: ["tests fail", "scope exceeds allowed_files", "evidence not reproducible"],
      final_report: { required: DEFAULT_FINAL_REPORT },
      blocked_reason: isRisk
        ? null
        : "insufficient evidence to scope a safe action (needs verification)",
    };
  });

  // Stable order by id (R4).
  items.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return items;
}
