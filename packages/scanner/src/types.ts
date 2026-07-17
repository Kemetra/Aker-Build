import type { Evidence, ProjectMap } from "@aker-build/project-map";
import type { ScanBudget, ScanUsage } from "./budget.js";

/** A detection signal = a 002 Evidence Object justifying a map value. */
export type DetectionSignal = Evidence;

/** A recorded operational event during a scan. Never contains a secret value (FR-012). */
export interface RunNote {
  kind: "skip" | "insufficient_evidence" | "flagged_secret" | "warning";
  path: string | null;
  message: string;
}

/** The result of one read-only scan run. */
export interface ScanResult {
  map: ProjectMap;
  notes: RunNote[];
  usage: ScanUsage;
}

export interface ScanOptions {
  /** Output directory (outside the scanned repo's tracked source). Default ".aker-build". */
  out?: string;
  /** Optional explicit config path. If omitted, aker-build.config.json/yaml is auto-discovered. */
  configPath?: string;
  /** Optional filesystem budget. Omitted means explicitly unbounded for CLI compatibility. */
  budget?: ScanBudget;
}
