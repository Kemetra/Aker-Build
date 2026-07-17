// Public surface for @aker-build/prompt.
// Compile a safe, scoped Markdown prompt from a routed queue item (006).

import { compileItem } from "./compile.js";
import { loadItem, writePrompt } from "./io.js";
import type { CompileOptions, CompiledPrompt } from "./types.js";

const DEFAULT_OUT = ".aker-build";

/**
 * Compile a safe prompt for queue item `<id>`. Reads queue.json from `out`, looks up the item, and
 * renders for the chosen agent. Refuses (throws ScopeIncompleteError) on missing scope info. Does NOT
 * write a file (use compilePromptToFile).
 */
export function compilePrompt(id: string, opts: CompileOptions = {}): CompiledPrompt {
  const out = opts.out ?? DEFAULT_OUT;
  const item = loadItem(out, id);
  return compileItem(item, opts.agent);
}

/** Compile and write `prompt-<id>.md` to the out-dir. Returns the path + compiled prompt. */
export function compilePromptToFile(id: string, opts: CompileOptions = {}): { outPath: string; prompt: CompiledPrompt } {
  const out = opts.out ?? DEFAULT_OUT;
  const prompt = compilePrompt(id, opts);
  return { outPath: writePrompt(out, id, prompt.markdown), prompt };
}

export { compileItem, resolveAgent, ScopeIncompleteError } from "./compile.js";
export { checkScope, isCompilable } from "./scope.js";
export { buildSections } from "./sections.js";
export { loadItem, writePrompt, MissingQueueError, UnknownItemError } from "./io.js";
export {
  DEFAULT_GIT_RULES,
  DEFAULT_STOP_CONDITIONS,
  FINAL_REPORT_FIELDS,
  REPO_STATE_VERIFICATION,
} from "./defaults.js";
export type { AgentName, CompileOptions, CompiledPrompt, ScopeGap } from "./types.js";
