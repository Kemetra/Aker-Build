import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deriveQueue, MissingProjectMapError, MissingRisksError } from "../src/index.js";
import { fixtureRepo, minimalMap, riskList } from "./helpers.js";

/**
 * These messages are the only place the product tells a user what to type. If the
 * command is renamed and a message is missed, the tool sends people to a command that
 * does not exist -- and without this test, no other test would notice.
 */
describe("error guidance names the real command", () => {
  function emptyGitRepo(): string {
    const dir = mkdtempSync(join(tmpdir(), "aker-guidance-"));
    execFileSync("git", ["init", "--quiet"], { cwd: dir });
    return dir;
  }

  it("a missing project map tells the user to run `aker scan`", () => {
    const repoRoot = emptyGitRepo();
    try {
      let message = "";
      try {
        deriveQueue(repoRoot, { out: join(repoRoot, ".aker-build") });
        throw new Error("expected MissingProjectMapError");
      } catch (err) {
        expect(err).toBeInstanceOf(MissingProjectMapError);
        message = (err as Error).message;
      }
      expect(message).toContain("`aker scan`");
      expect(message).not.toContain("aker-build scan");
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("a missing risks file tells the user to run `aker gates`", () => {
    const { repoRoot, outDir } = fixtureRepo(minimalMap(), riskList([]));
    rmSync(join(outDir, "risks.json"), { force: true });
    let message = "";
    try {
      deriveQueue(repoRoot, { out: outDir });
      throw new Error("expected MissingRisksError");
    } catch (err) {
      expect(err).toBeInstanceOf(MissingRisksError);
      message = (err as Error).message;
    }
    expect(message).toContain("`aker gates`");
    expect(message).not.toContain("aker-build gates");
  });

  it("no guidance string in the queue sources references the retired command", () => {
    // Guards every message at once, including ones added later.
    for (const rel of ["../src/context.ts", "../src/index.ts"]) {
      const text = readFileSync(new URL(rel, import.meta.url), "utf8");
      expect(text).not.toMatch(/`aker-build [a-z-]+`/);
    }
  });
});
