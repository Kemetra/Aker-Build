#!/usr/bin/env node
// Published CLI entry for the benchmark. NOTE: like the `aker-build` CLI bin, this uses `.js`
// import specifiers that resolve to `.ts` sources and therefore requires a TS-aware runtime
// (a build step, or `tsx`) — plain `node` does not do `.js`→`.ts` resolution. In-repo, this bin
// is exercised two ways: the vitest CI gate (`packages/eval/tests/ci-gate.test.ts`, run via
// `pnpm test`) asserts thresholds in-process, and the dogfood workflow's `benchmark` job runs
// this bin directly on PRs via `tsx`. This file mirrors the CLI bin so a published/built package
// exposes a `aker-build-benchmark` command.
import { resolve } from "node:path";
import { runBenchmarkSuite } from "./run.js";
import { renderMarkdown } from "./report.js";

// Resolve corpus/thresholds relative to the repo root (two levels up from packages/eval/src).
const repoRoot = resolve(import.meta.dirname, "../../..");
const corpusDir = resolve(repoRoot, "benchmark/cases");
const outDir = resolve(repoRoot, ".aker-build");
const thresholdsPath = resolve(repoRoot, "benchmark/thresholds.json");

const { report, breaches, jsonPath } = runBenchmarkSuite(corpusDir, outDir, thresholdsPath);

process.stdout.write(renderMarkdown(report));
process.stdout.write(`\nScorecard written to ${jsonPath}\n`);

if (breaches.length > 0) {
  process.stderr.write(`\nThreshold breaches (${breaches.length}):\n`);
  for (const b of breaches) {
    process.stderr.write(
      `  ${b.gate} ${b.tier} ${b.metric}: ${b.actual ?? "—"} < floor ${b.floor}\n`,
    );
  }
  process.exit(1);
}
process.stdout.write("\nAll thresholds met.\n");
