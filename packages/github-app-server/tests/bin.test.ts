import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * The host entrypoint (`bin.ts`) is a THIN shim: its only job is to boot the server by calling the
 * exported `start()` composition once. We do NOT re-test that `start()` actually serves HTTP — that
 * is covered end-to-end by start-server.test.ts (real ephemeral socket: 405/413/200/secret-safe-500).
 *
 * Here we mock the `http-server.js` seam so the bin can be imported WITHOUT real credentials and
 * WITHOUT binding a socket — `start()`'s default `composeDeps()` would otherwise throw on missing env
 * creds and open a real port. This isn't a vacuous "test the mock" check: it goes RED the moment the
 * bin stops calling `start()` (or calls something else), which is the shim's entire contract.
 */
const startSpy = vi.fn(() => ({ close: () => {} }));

vi.mock("../src/http-server.js", () => ({ start: startSpy }));

beforeEach(() => {
  startSpy.mockClear();
  vi.resetModules(); // ensure the bin's top-level code re-runs on each fresh import
});

describe("bin.ts host entrypoint", () => {
  it("boots the server by calling start() exactly once on load", async () => {
    await import("../src/bin.js");
    expect(startSpy).toHaveBeenCalledOnce();
  });

  it("calls start() with no explicit deps — it uses the default env-composed runtime", async () => {
    await import("../src/bin.js");
    // The shim must NOT inject its own deps/credentials; it relies on start()'s default composeDeps()
    // so production wiring (and secret handling) lives in one place. Zero args = default composition.
    expect(startSpy).toHaveBeenCalledWith();
  });
});
