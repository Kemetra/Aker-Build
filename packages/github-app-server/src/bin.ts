#!/usr/bin/env node
// Host entrypoint for the report-only GitHub App deployment runtime. This is a THIN shim: it boots
// the server by calling the exported `start()` composition, which reads credentials from the
// environment (composeDeps), wires the concrete octokit/git adapters, and binds the HTTP listener.
//
// NOTE (matches the `tenantguard` and `tenantguard-benchmark` bins): this file uses `.js` import
// specifiers that resolve to `.ts` sources, so it requires a TS-aware runtime — a build step, or a
// dev runner like `tsx`. Plain `node` does NOT do `.js`→`.ts` resolution. The in-repo working TS
// execution path is vitest (see tests/bin.test.ts, which proves this shim calls `start()` once, and
// tests/start-server.test.ts, which boots the real socket). Secrets are read ONLY from the
// environment by `start()`/`composeDeps()`; this shim handles none directly (Principle VII).
import { start } from "./http-server.js";

start();
