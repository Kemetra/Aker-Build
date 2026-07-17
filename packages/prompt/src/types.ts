/** Supported agent renderers. Unknown input falls back to "generic" (FR-010). */
export type AgentName = "claude" | "codex" | "generic";

export interface CompileOptions {
  /** Output/input directory holding queue.json. Default ".aker-build". */
  out?: string;
  /** Agent renderer; unknown values fall back to generic + a note. */
  agent?: string;
}

/** The compiled prompt + which agent it was rendered for. */
export interface CompiledPrompt {
  id: string;
  agent: AgentName;
  markdown: string;
}

/** The scope fields a refused item was missing (drives the refusal message; FR-009). */
export interface ScopeGap {
  missing: string[];
}
