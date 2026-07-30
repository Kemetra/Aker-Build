#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { nextTask, compileFor } from "./tools.js";
import { denyBlock } from "./deny-block.js";

// Transport wiring only. All logic lives in tools.ts / deny-block.ts so it stays testable without
// a live client. Registration uses registerTool(name, config, cb) — every server.tool() overload
// is deprecated in SDK 1.30.
const server = new McpServer({ name: "aker-build", version: "0.1.0" });

/** Wrap a handler so a thrown error reaches the model as readable text, not a stack trace. */
function reply(fn: () => unknown): { content: { type: "text"; text: string }[]; isError?: boolean } {
  try {
    return { content: [{ type: "text", text: JSON.stringify(fn(), null, 2) }] };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Aker Build could not answer: ${message}` }], isError: true };
  }
}

server.registerTool(
  "aker_build_next_task",
  {
    title: "Next safest task",
    description:
      "Return the next safest task for an AI agent to attempt in this repository, together with " +
      "the files it may and may not touch, and the evidence (file:line) that justified both. " +
      "The scope is derived from a scan of the architecture, not hand-declared. Read-only: this " +
      "never modifies the repository and never runs an agent. Call it before starting work, and " +
      "again after finishing a task.",
    inputSchema: {
      repo: z.string().describe("Path to the git repository to analyse."),
      ttl_ms: z
        .number()
        .optional()
        .describe("Reuse analysis artifacts younger than this many ms (default 300000)."),
    },
  },
  ({ repo, ttl_ms }) => reply(() => nextTask(repo, { ttlMs: ttl_ms })),
);

server.registerTool(
  "aker_build_compile_prompt",
  {
    title: "Compile a scoped prompt",
    description:
      "Compile the safe, scoped prompt for a queue item id (e.g. Q-002) as returned by " +
      "aker_build_next_task. The prompt carries the objective, allowed and forbidden files, " +
      "validation commands, git rules, stop conditions, and the required final-report shape. " +
      "Read-only: returns text, executes nothing.",
    inputSchema: {
      repo: z.string().describe("Path to the git repository to analyse."),
      id: z.string().describe("Queue item id, e.g. Q-002."),
      agent: z
        .enum(["claude", "codex", "generic"])
        .optional()
        .describe("Target agent dialect (default generic)."),
    },
  },
  ({ repo, id, agent }) => reply(() => compileFor(repo, id, agent)),
);

server.registerTool(
  "aker_build_deny_block",
  {
    title: "Render a settings.json deny-block",
    description:
      "Render a forbidden-file set as a Claude Code settings.json deny-block, so the platform's " +
      "deny-first permission engine enforces the boundary mechanically instead of relying on the " +
      "model to respect prompt text. Note: deny rules govern the agent's own file tools and do " +
      "not constrain arbitrary subprocesses — stronger than a prompt, not airtight. Read-only.",
    inputSchema: {
      forbidden_files: z
        .array(z.string())
        .describe("Forbidden paths or globs, as returned by aker_build_next_task."),
    },
  },
  ({ forbidden_files }) => reply(() => denyBlock(forbidden_files)),
);

const transport = new StdioServerTransport();
await server.connect(transport);
