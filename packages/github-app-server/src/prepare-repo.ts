import { join } from "node:path";
import { scanToFile } from "@tenantguard/scanner";

/**
 * Scan a freshly-checked-out repo and produce its project-map so the gates can run against it.
 *
 * This closes the always-neutral defect: the App's ephemeral checkout is a bare `git fetch` that has
 * never been scanned, so `runGates` (via `buildContext`) would resolve `project-map.json` from the
 * server's cwd, fail with `MissingProjectMapError`, and degrade every review to neutral. By scanning
 * the checkout into an ABSOLUTE out-dir *inside* the checkout and returning that path (threaded into
 * `reviewPr` as `opts.out`), resolution stays in the checkout regardless of cwd.
 *
 * The out-dir lives under the ephemeral checkout, so the workspace's `dispose` removes it with the
 * rest of the source — nothing is persisted (FR-011). Read-only on the repo apart from writing the
 * map under `<repoRoot>/.tenantguard`.
 */
export function prepareRepo(repoRoot: string): string {
  const out = join(repoRoot, ".tenantguard");
  scanToFile(repoRoot, out);
  return out;
}
