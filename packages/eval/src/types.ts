/** A confidence tier (mirrors @aker-build/gates ConfidenceTier). */
export type Tier = "confirmed" | "suspected";

/** A finding the corpus author asserts SHOULD fire, keyed by gate + path + tier (P3 Decision 1/2). */
export interface ExpectedFinding {
  gate_id: string;
  path: string;
  tier: Tier;
}

/** A finding actually produced by the real pipeline, gate-scoped, same match key. */
export interface ActualFinding {
  gate_id: string;
  path: string;
  tier: Tier;
}

/** A labeled benchmark case: a synthetic repo + ground truth, scoped to specific gates. */
export interface BenchmarkCase {
  name: string;
  /** Absolute path to the case's repo dir (the dir holding the synthetic source). */
  dir: string;
  description: string;
  /** Only findings from these gates are scored; everything else is ignored (baseline noise). */
  gates_under_test: string[];
  expected_findings: ExpectedFinding[];
}

/** The `expected.json` on-disk shape (the repo dir is `<case>/repo`, the label is `<case>/expected.json`). */
export interface ExpectedFile {
  description: string;
  gates_under_test: string[];
  expected_findings: ExpectedFinding[];
}
