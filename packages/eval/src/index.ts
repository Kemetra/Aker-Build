// Public surface for @aker-build/eval — the detection-quality benchmark harness.
export { loadCases, CorpusError } from "./corpus.js";
export { runCase } from "./run-case.js";
export { scoreCase, precisionRecall, addCounts, TIERS } from "./metrics.js";
export type { Counts, CaseScore } from "./metrics.js";
export { runBenchmark, renderMarkdown, BENCHMARK_REPORT_VERSION } from "./report.js";
export type { BenchmarkReport, GateMetric, TierMetric } from "./report.js";
export { checkThresholds } from "./thresholds.js";
export type { Thresholds, TierThreshold, Breach } from "./thresholds.js";
export { runBenchmarkSuite, writeReport, loadThresholds } from "./run.js";
export type { BenchmarkRunResult } from "./run.js";
export type { BenchmarkCase, ExpectedFinding, ActualFinding, ExpectedFile, Tier } from "./types.js";
