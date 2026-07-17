import type { Section } from "../sections.js";
import { renderGeneric } from "./generic.js";

/** Codex framing preamble — presentation only; the section bodies are unchanged (FR-015). */
const CODEX_PREAMBLE =
  "# Task for the coding agent\n" +
  "Operate under Aker Build's safety contract. Each section below is mandatory; " +
  "the Git rules and Stop conditions are hard constraints you must not violate.";

/** Render for Codex: same sections/headings, with a codex-appropriate framing preamble. */
export function renderCodex(sections: Section[]): string {
  return renderGeneric(sections, CODEX_PREAMBLE);
}
