import { execFileSync, fork } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("compiled production artifacts", () => {
  it("launches the worker bundle and returns a validated fixed result", async () => {
    execFileSync(process.execPath, ["scripts/build.mjs"], { cwd: process.cwd(), stdio: "ignore" });

    const result = await new Promise<unknown>((resolve, reject) => {
      const child = fork("dist/worker-entry.mjs", [], {
        cwd: process.cwd(),
        execArgv: [],
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      });
      let stderr = "";
      child.stderr?.on("data", (chunk) => { stderr += String(chunk); });
      const timeout = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("compiled worker did not respond"));
      }, 5_000);
      child.once("message", (message) => {
        clearTimeout(timeout);
        child.kill();
        resolve(message);
      });
      child.once("exit", (code) => {
        if (code !== null && code !== 0) {
          clearTimeout(timeout);
          reject(new Error(`compiled worker exited ${code}: ${stderr}`));
        }
      });
      child.send({ type: "invalid" });
    });

    expect(result).toEqual({
      type: "result",
      code: "worker_failed",
      usage: { filesConsidered: 0, filesRead: 0, bytesRead: 0 },
      githubRetries: 0,
    });
  });
});
