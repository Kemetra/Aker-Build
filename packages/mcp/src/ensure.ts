import { existsSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { runCheck } from "@aker-build/cli";

/** Default out-dir, matching the CLI so agent and human see the same artifacts. */
const DEFAULT_OUT = ".aker-build";

/** How long produced artifacts are considered fresh. Five minutes. */
const DEFAULT_TTL_MS = 300_000;

export interface EnsureOptions {
  /** Out-dir for produced artifacts. Defaults to `.aker-build` under the target repo. */
  out?: string;
  /** Reuse artifacts younger than this. Defaults to 5 minutes. */
  ttlMs?: number;
  /** Force a re-derivation regardless of age. */
  force?: boolean;
}

export interface EnsureResult {
  /** Absolute path to the out-dir holding the artifacts. */
  out: string;
  /** Whether the chain was re-run on this call. */
  refreshed: boolean;
  /** Age of the reused artifacts in ms; 0 when just refreshed. */
  ageMs: number;
}

/** Raised when the chain runs but produces no queue — the caller cannot proceed. */
export class ChainFailedError extends Error {}

/**
 * Make the produced artifacts present and fresh, running the CLI chain when they are absent,
 * stale, or forced.
 *
 * Why this exists: `deriveQueue`, `route` and `compilePrompt` all read artifacts from an out-dir
 * and throw when they are missing (`route` throws MissingQueueError: "Run `aker queue`
 * first"). An MCP tool that called them directly would hand a cold agent an exception instead of
 * an answer, which would defeat the entire premise — the agent is supposed to ask and receive.
 *
 * Running the chain on *every* call would be honest but wasteful for an agent that polls, so
 * artifacts inside the TTL are reused. Staleness is reported back to the caller in `ageMs` rather
 * than silently tolerated: an agent acting on stale advice must be able to see that it is stale.
 *
 * Delegates to the CLI's own `runCheck` rather than re-sequencing scan → gates → queue → route
 * here. A second implementation of the chain would drift from the first and give agents different
 * advice through a different door.
 */
export function ensureChain(targetPath: string, opts: EnsureOptions = {}): EnsureResult {
  const target = resolve(targetPath);
  const out = resolve(opts.out ?? join(target, DEFAULT_OUT));
  const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS;
  const queuePath = join(out, "queue.json");

  if (!opts.force && existsSync(queuePath)) {
    const ageMs = Date.now() - statSync(queuePath).mtimeMs;
    if (ageMs <= ttlMs) return { out, refreshed: false, ageMs };
  }

  // stdout is the JSON-RPC channel when this runs under a stdio transport, so the chain's
  // human-facing output is swallowed. Errors are collected and surfaced via the thrown message.
  const diagnostics: string[] = [];
  runCheck(target, {
    out,
    sink: () => {},
    errSink: (line: string) => {
      diagnostics.push(line);
    },
  });

  if (!existsSync(queuePath)) {
    const detail = diagnostics.length > 0 ? `: ${diagnostics.join("; ")}` : "";
    throw new ChainFailedError(`chain produced no queue at ${queuePath}${detail}`);
  }

  return { out, refreshed: true, ageMs: 0 };
}
