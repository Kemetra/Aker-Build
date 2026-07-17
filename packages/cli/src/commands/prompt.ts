import {
  compilePrompt,
  compilePromptToFile,
  ScopeIncompleteError,
  MissingQueueError,
  UnknownItemError,
} from "@aker-build/prompt";
import { NotGitRepoError } from "@aker-build/queue";

export interface PromptCmdOptions {
  agent?: string;
  out?: string;
  stdout?: boolean;
  sink?: (line: string) => void;
  errSink?: (line: string) => void;
}

const DEFAULT_OUT = ".aker-build";

/**
 * Run the `prompt` command. Returns an exit code (no process.exit, testable).
 * 0 = prompt compiled · 1 = missing queue.json (run queue first) ·
 * 2 = bad input (unknown id / scope-incomplete refusal / not a Git repo) · 3 = internal error.
 */
export function runPromptCommand(id: string, opts: PromptCmdOptions = {}): number {
  const out = opts.out ?? DEFAULT_OUT;
  const print = opts.sink ?? ((s: string) => process.stdout.write(s + "\n"));
  const printErr = opts.errSink ?? ((s: string) => process.stderr.write(s + "\n"));

  try {
    if (opts.stdout) {
      const prompt = compilePrompt(id, { out, agent: opts.agent });
      print(prompt.markdown);
      return 0;
    }
    const { outPath, prompt } = compilePromptToFile(id, { out, agent: opts.agent });
    printErr(`Wrote ${outPath} (agent: ${prompt.agent})`);
    print(prompt.markdown);
    return 0;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    printErr(msg);
    if (err instanceof MissingQueueError) return 1;
    if (err instanceof UnknownItemError || err instanceof ScopeIncompleteError || err instanceof NotGitRepoError) {
      return 2;
    }
    return 3;
  }
}
