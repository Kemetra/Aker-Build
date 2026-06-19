import type { Evidence, ProjectMap } from "@tenantguard/project-map";

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
}

export interface ScanOptions {
  /** Output directory (outside the scanned repo's tracked source). Default ".tenantguard". */
  out?: string;
  /** Optional explicit config path. If omitted, tenantguard.config.json/yaml is auto-discovered. */
  configPath?: string;
}
