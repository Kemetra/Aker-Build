import type { QueueItem } from "@aker-build/queue";
import type { AgentName, CompiledPrompt } from "./types.js";
import { checkScope } from "./scope.js";
import { buildSections } from "./sections.js";
import { renderGeneric } from "./renderers/generic.js";
import { renderClaude } from "./renderers/claude.js";
import { renderCodex } from "./renderers/codex.js";

/** Raised when an item lacks required scope info — the compiler refuses (FR-009). */
export class ScopeIncompleteError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Cannot compile a safe prompt: item is missing required scope info: ${missing.join(", ")}`);
    this.name = "ScopeIncompleteError";
  }
}

/** Normalize an agent string to a known renderer; unknown → generic (caller adds a note). FR-010. */
export function resolveAgent(agent?: string): { agent: AgentName; unknown: boolean } {
  if (agent === "claude" || agent === "codex" || agent === "generic") return { agent, unknown: false };
  if (agent === undefined || agent === "") return { agent: "generic", unknown: false };
  return { agent: "generic", unknown: true };
}

/**
 * Compile a safe Markdown prompt from a QueueItem for the chosen agent. Refuses (throws
 * ScopeIncompleteError) when the item lacks required scope info — never emits a partial prompt.
 * Deterministic for a given (item, agent) (FR-016).
 */
export function compileItem(item: QueueItem, agentInput?: string): CompiledPrompt {
  const gap = checkScope(item);
  if (gap.missing.length > 0) throw new ScopeIncompleteError(gap.missing);

  const { agent, unknown } = resolveAgent(agentInput);
  const sections = buildSections(item);

  let markdown: string;
  if (agent === "claude") markdown = renderClaude(sections);
  else if (agent === "codex") markdown = renderCodex(sections);
  else {
    const note = unknown
      ? `> Note: unknown agent "${agentInput}" — rendered with the generic renderer.\n\n`
      : undefined;
    markdown = renderGeneric(sections, note?.trimEnd());
  }

  return { id: item.id, agent, markdown };
}
