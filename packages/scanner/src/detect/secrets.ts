import { readFileSafe } from "../io.js";
import type { RunNote } from "../types.js";

// High-signal secret patterns. We only need to KNOW a secret-like value is present — we never
// capture or store the matched value itself (FR-012).
const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/, // AWS access key id
  /-----BEGIN[ A-Z]*PRIVATE KEY-----/, // PEM private key
  /(secret|password|token|api[_-]?key)\s*[:=]\s*['"]?[A-Za-z0-9/+_-]{16,}/i,
];

const SECRET_FILE_HINTS = [".env", ".env.local", "secrets", "credentials"];

/**
 * Scan files for secret-like content. Returns flagged_secret RunNotes carrying only the PATH and a
 * signal — never the secret value (FR-012, SC-006).
 */
export function detectSecrets(root: string, files: string[]): RunNote[] {
  const notes: RunNote[] = [];
  for (const rel of files) {
    const base = rel.split("/").pop() ?? rel;
    const looksSensitive = SECRET_FILE_HINTS.some((h) => base.includes(h));
    const content = readFileSafe(root, rel);
    if (content === null) continue;
    const matched = SECRET_PATTERNS.some((re) => re.test(content));
    if (matched || (looksSensitive && content.trim().length > 0)) {
      notes.push({
        kind: "flagged_secret",
        path: rel,
        message: `secret-like content detected in ${rel} (value not captured)`,
      });
    }
  }
  return notes;
}
