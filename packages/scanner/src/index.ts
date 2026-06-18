// Public surface for @tenantguard/scanner.
// Read-only repo scan producing a 002-conforming Project Map + run notes.

export { scan, scanToFile } from "./scan.js";
export type { ScanResult, ScanOptions, DetectionSignal, RunNote } from "./types.js";

// Read-only filesystem primitives, reused by @tenantguard/gates (004 R2) so the
// no-mutation guarantee lives in one audited place.
export { listFiles, fileExists, readFileSafe, isGitRepo, writeOutput } from "./io.js";
