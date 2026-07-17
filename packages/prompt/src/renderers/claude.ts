import type { Section } from "../sections.js";
import { renderGeneric } from "./generic.js";

/** Claude framing preamble — presentation only; the section bodies are unchanged (FR-015). */
const CLAUDE_PREAMBLE =
  "You are an AI coding agent operating under Aker Build's safety contract. " +
  "Follow every section below exactly. Treat the Git rules and Stop conditions as hard constraints.";

/** Render for Claude: same sections/headings, with a claude-appropriate framing preamble. */
export function renderClaude(sections: Section[]): string {
  return renderGeneric(sections, CLAUDE_PREAMBLE);
}
