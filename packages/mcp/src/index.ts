// Public surface for @aker-build/mcp.
// Expose the control plane to coding agents: what to work on next, and what may be touched.
//
// The transport is not the product. Governance servers already expose review and debt
// prioritisation over MCP; what is unoccupied is the content — a task ordered by agent-safety,
// with scope derived from a scan rather than hand-declared. Handlers live here as plain
// functions so they are testable without a live MCP client.

export { ensureChain, ChainFailedError } from "./ensure.js";
export type { EnsureOptions, EnsureResult } from "./ensure.js";

export { nextTask, compileFor } from "./tools.js";
export type { NextTaskResult, CompiledPromptResult, ToolEvidence } from "./tools.js";

export { denyBlock } from "./deny-block.js";
export type { DenyBlock } from "./deny-block.js";
