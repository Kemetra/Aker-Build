import { readFileSync } from "node:fs";
import { join } from "node:path";
import { route } from "@aker-build/queue";
import type { Queue, QueueItem } from "@aker-build/queue";
import { compilePrompt } from "@aker-build/prompt";
import type { AgentName } from "@aker-build/prompt";
import { ensureChain } from "./ensure.js";
import type { EnsureOptions } from "./ensure.js";

/** One evidence span, flattened for an agent that will not import our types. */
export interface ToolEvidence {
  path: string;
  line: number | null;
  signal: string;
  confidence: string;
}

export interface NextTaskResult {
  item: {
    id: string;
    title: string;
    type: string;
    priority: string;
    risk: string;
    confidence_tier: string;
  } | null;
  /** Why this task, or — when item is null — why there is no safe task. Never empty. */
  reason: string[];
  allowed_files: string[];
  forbidden_files: string[];
  evidence: ToolEvidence[];
  /** Other items the router declined, with the reason each is blocked. */
  blocked: { id: string; reason: string }[];
  freshness: { refreshed: boolean; age_ms: number };
}

function loadQueue(out: string): Queue {
  return JSON.parse(readFileSync(join(out, "queue.json"), "utf8")) as Queue;
}

/**
 * Answer "what is my next safest task, and what may I touch?" for an agent.
 *
 * This is the tool the whole server exists for. An MCP transport is not a differentiator —
 * governance servers already expose review and debt prioritisation over MCP. What is unoccupied
 * is the *content*: a task ordered by agent-safety, with the touchable file set derived from a
 * scan rather than hand-declared by the user, and the evidence that justified both.
 *
 * Read-only: computes and reports. Never mutates the repository and never executes an agent.
 */
export function nextTask(targetPath: string, opts: EnsureOptions = {}): NextTaskResult {
  const fresh = ensureChain(targetPath, opts);
  const decision = route(targetPath, { out: fresh.out });
  const freshness = { refreshed: fresh.refreshed, age_ms: fresh.ageMs };

  if (decision.next === null) {
    return {
      item: null,
      // Honesty default: a bare null tells an agent nothing it can act on.
      reason:
        decision.no_safe_task_reasons.length > 0
          ? decision.no_safe_task_reasons
          : ["no queue item is currently routable"],
      allowed_files: [],
      forbidden_files: [],
      evidence: [],
      blocked: decision.blocked,
      freshness,
    };
  }

  // RouterDecision.next carries only id/title/reason; scope and evidence live on the queue item.
  const item = loadQueue(fresh.out).items.find((i: QueueItem) => i.id === decision.next?.id);
  if (!item) {
    return {
      item: null,
      reason: [`router selected ${decision.next.id} but it is absent from queue.json`],
      allowed_files: [],
      forbidden_files: [],
      evidence: [],
      blocked: decision.blocked,
      freshness,
    };
  }

  return {
    item: {
      id: item.id,
      title: item.title,
      type: item.type,
      priority: item.priority,
      risk: item.risk,
      // Absence means confirmed, per the queue contract.
      confidence_tier: item.confidence_tier ?? "confirmed",
    },
    reason: decision.next.reason,
    allowed_files: item.allowed_files,
    forbidden_files: item.forbidden_files,
    evidence: (item.source.evidence ?? []).map((e) => ({
      path: e.path ?? "",
      line: e.line ?? null,
      signal: e.signal,
      confidence: e.confidence,
    })),
    blocked: decision.blocked,
    freshness,
  };
}

export interface CompiledPromptResult {
  id: string;
  agent: string;
  markdown: string;
  freshness: { refreshed: boolean; age_ms: number };
}

/**
 * Compile the safe, scoped prompt for a queue item.
 *
 * The prompt already carries objective, allowed/forbidden files, validation commands, git rules,
 * stop conditions and the required final-report shape — the compiler refuses to emit one when
 * scope information is missing rather than guessing. This wrapper adds only cold-callability.
 *
 * Read-only, and it does not execute anything: it returns text for the caller to act on.
 */
export function compileFor(
  targetPath: string,
  id: string,
  agent?: string,
  opts: EnsureOptions = {},
): CompiledPromptResult {
  const fresh = ensureChain(targetPath, opts);
  const compiled = compilePrompt(id, { out: fresh.out, agent: agent as AgentName | undefined });
  return {
    id,
    agent: agent ?? "generic",
    markdown: compiled.markdown,
    freshness: { refreshed: fresh.refreshed, age_ms: fresh.ageMs },
  };
}
