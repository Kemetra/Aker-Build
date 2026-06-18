// Public surface for @tenantguard/scanner.
// Read-only repo scan producing a 002-conforming Project Map + run notes.

export { scan, scanToFile } from "./scan.js";
export type { ScanResult, ScanOptions, DetectionSignal, RunNote } from "./types.js";
