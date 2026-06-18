import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readdirSync, statSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

export function fixture(name: string): string {
  return resolve(here, "fixtures", name);
}

/** Snapshot of every file path + size + mtime under a dir (for read-only verification). */
export function snapshot(root: string): Map<string, string> {
  const snap = new Map<string, string>();
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = resolve(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.isFile()) {
        const s = statSync(p);
        snap.set(p, `${s.size}:${s.mtimeMs}`);
      }
    }
  };
  walk(root);
  return snap;
}
