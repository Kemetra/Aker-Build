import type { BenchmarkCase, Tier } from "./types.js";
import { runCase } from "./run-case.js";
import { scoreCase, precisionRecall, addCounts, TIERS, type Counts } from "./metrics.js";

export const BENCHMARK_REPORT_VERSION = 1;

export interface TierMetric extends Counts {
  precision: number | null;
  recall: number | null;
}

export interface GateMetric {
  byTier: Record<Tier, TierMetric>;
  overall: TierMetric;
}

export interface BenchmarkReport {
  schema_version: number;
  per_gate: Record<string, GateMetric>;
  overall: TierMetric;
  cases: { name: string; tp: number; fp: number; fn: number }[];
}

function toMetric(c: Counts): TierMetric {
  const { precision, recall } = precisionRecall(c);
  return { ...c, precision, recall };
}

function emptyCounts(): Counts {
  return { tp: 0, fp: 0, fn: 0 };
}

/**
 * Run the full corpus through the real pipeline and aggregate precision/recall per gate × tier.
 * Deterministic: cases are pre-sorted by `loadCases`, and aggregation is order-independent.
 * `runner` is injectable so tests can substitute stubbed actuals without spawning the pipeline.
 */
export function runBenchmark(
  cases: BenchmarkCase[],
  runner: (c: BenchmarkCase) => ReturnType<typeof runCase> = runCase,
): BenchmarkReport {
  // gate -> tier -> counts
  const gateTier = new Map<string, Record<Tier, Counts>>();
  const caseSummaries: BenchmarkReport["cases"] = [];

  for (const c of cases) {
    const actual = runner(c);
    const score = scoreCase(c.expected_findings, actual);
    caseSummaries.push({ name: c.name, tp: score.tp, fp: score.fp, fn: score.fn });

    for (const gate of c.gates_under_test) {
      if (!gateTier.has(gate)) {
        gateTier.set(gate, { confirmed: emptyCounts(), suspected: emptyCounts() });
      }
    }
    // Attribute each tier's counts to every gate under test in this case. Cases are gate-scoped,
    // so in practice a case targets one gate; if it lists several, the counts apply to each.
    for (const gate of c.gates_under_test) {
      const slot = gateTier.get(gate)!;
      for (const tier of TIERS) {
        slot[tier] = addCounts(slot[tier], score.byTier[tier]);
      }
    }
  }

  const per_gate: Record<string, GateMetric> = {};
  let overallCounts = emptyCounts();
  for (const gate of [...gateTier.keys()].sort()) {
    const slot = gateTier.get(gate)!;
    const byTier = {
      confirmed: toMetric(slot.confirmed),
      suspected: toMetric(slot.suspected),
    } as Record<Tier, TierMetric>;
    const gateOverall = addCounts(slot.confirmed, slot.suspected);
    per_gate[gate] = { byTier, overall: toMetric(gateOverall) };
    overallCounts = addCounts(overallCounts, gateOverall);
  }

  return {
    schema_version: BENCHMARK_REPORT_VERSION,
    per_gate,
    overall: toMetric(overallCounts),
    cases: caseSummaries,
  };
}

/** Render the report as human-facing markdown (canonical artifact is the JSON). */
export function renderMarkdown(report: BenchmarkReport): string {
  const pct = (v: number | null): string => (v === null ? "—" : `${(v * 100).toFixed(0)}%`);
  const lines: string[] = ["# Aker Build Benchmark Report", ""];
  lines.push(`Schema version: ${report.schema_version}`, "");
  lines.push("## Per gate × tier", "");
  lines.push("| Gate | Tier | Precision | Recall | TP | FP | FN |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const gate of Object.keys(report.per_gate).sort()) {
    for (const tier of TIERS) {
      const m = report.per_gate[gate]!.byTier[tier];
      lines.push(`| ${gate} | ${tier} | ${pct(m.precision)} | ${pct(m.recall)} | ${m.tp} | ${m.fp} | ${m.fn} |`);
    }
  }
  lines.push("", "## Cases", "");
  lines.push("| Case | TP | FP | FN |", "|---|---|---|---|");
  for (const c of report.cases) lines.push(`| ${c.name} | ${c.tp} | ${c.fp} | ${c.fn} |`);
  return lines.join("\n") + "\n";
}
