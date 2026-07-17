import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalSnapshots, createRefSnapshots } from "../src/snapshot.js";
import { makeDiffRepo } from "./helpers.js";

function git(root: string, ...args: string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
}

function indexDigest(root: string): string {
  return createHash("sha256").update(readFileSync(join(root, ".git", "index"))).digest("hex");
}

describe("owned Git archive snapshots", () => {
  it("materializes an explicit base and HEAD plus working/staged/untracked/deleted overlay without mutation", () => {
    const repo = makeDiffRepo({
      baseline: {
        "committed.txt": "base\n",
        "working.txt": "base\n",
        "staged.txt": "base\n",
        "deleted.txt": "base\n",
      },
    });
    const baseSha = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "committed.txt"), "head\n", "utf8");
    git(repo, "add", "committed.txt");
    git(repo, "commit", "-q", "-m", "head");
    const headSha = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "working.txt"), "working\n", "utf8");
    writeFileSync(join(repo, "staged.txt"), "staged\n", "utf8");
    git(repo, "add", "staged.txt");
    writeFileSync(join(repo, "untracked.txt"), "untracked\n", "utf8");
    rmSync(join(repo, "deleted.txt"));
    const beforeHead = git(repo, "rev-parse", "HEAD");
    const beforeIndex = indexDigest(repo);
    const beforeStatus = git(repo, "status", "--porcelain=v1", "-z");

    const snapshots = createLocalSnapshots(repo, baseSha);
    expect(snapshots.complete).toBe(true);
    if (!snapshots.complete) throw new Error("expected complete snapshots");

    expect(snapshots.base).toEqual({ label: baseSha, sha: baseSha });
    expect(snapshots.head).toEqual({ label: "working-tree", sha: null });
    expect(readFileSync(join(snapshots.baseRoot, "committed.txt"), "utf8")).toBe("base\n");
    expect(readFileSync(join(snapshots.headRoot, "committed.txt"), "utf8")).toBe("head\n");
    expect(readFileSync(join(snapshots.headRoot, "working.txt"), "utf8")).toBe("working\n");
    expect(readFileSync(join(snapshots.headRoot, "staged.txt"), "utf8")).toBe("staged\n");
    expect(readFileSync(join(snapshots.headRoot, "untracked.txt"), "utf8")).toBe("untracked\n");
    expect(existsSync(join(snapshots.headRoot, "deleted.txt"))).toBe(false);
    expect(git(repo, "rev-parse", "HEAD")).toBe(beforeHead);
    expect(headSha).toBe(beforeHead);
    expect(indexDigest(repo)).toBe(beforeIndex);
    expect(git(repo, "status", "--porcelain=v1", "-z")).toBe(beforeStatus);

    const ownedRoot = snapshots.root;
    snapshots.dispose();
    expect(existsSync(ownedRoot)).toBe(false);
  });

  it("archives two exact refs and reports missing objects with a closed reason", () => {
    const repo = makeDiffRepo({ baseline: { "version.txt": "one\n" } });
    const baseSha = git(repo, "rev-parse", "HEAD");
    writeFileSync(join(repo, "version.txt"), "two\n", "utf8");
    git(repo, "add", "version.txt");
    git(repo, "commit", "-q", "-m", "two");
    const headSha = git(repo, "rev-parse", "HEAD");

    const snapshots = createRefSnapshots(repo, baseSha, headSha);
    expect(snapshots.complete).toBe(true);
    if (!snapshots.complete) throw new Error("expected complete snapshots");
    expect(snapshots.base.sha).toBe(baseSha);
    expect(snapshots.head.sha).toBe(headSha);
    expect(readFileSync(join(snapshots.baseRoot, "version.txt"), "utf8")).toBe("one\n");
    expect(readFileSync(join(snapshots.headRoot, "version.txt"), "utf8")).toBe("two\n");
    snapshots.dispose();

    const missing = createRefSnapshots(repo, "f".repeat(40), headSha);
    expect(missing.complete).toBe(false);
    expect(missing.incompleteReasons).toEqual(["base_unavailable"]);
    missing.dispose();
  });

  it("rejects committed symlinks, gitlinks, and LFS pointers before analysis", () => {
    const symlinkRepo = makeDiffRepo({ baseline: { "safe.txt": "safe\n" } });
    const linkBlob = execFileSync("git", ["hash-object", "-w", "--stdin"], {
      cwd: symlinkRepo,
      input: "../outside",
      encoding: "utf8",
    }).trim();
    git(symlinkRepo, "update-index", "--add", "--cacheinfo", `120000,${linkBlob},unsafe-link`);
    git(symlinkRepo, "commit", "-q", "-m", "link");
    const symlink = createRefSnapshots(symlinkRepo, "HEAD", "HEAD");
    expect(symlink.complete).toBe(false);
    expect(symlink.incompleteReasons).toEqual(["unsafe_path"]);
    symlink.dispose();

    const submoduleRepo = makeDiffRepo({ baseline: { "safe.txt": "safe\n" } });
    const commitSha = git(submoduleRepo, "rev-parse", "HEAD");
    git(submoduleRepo, "update-index", "--add", "--cacheinfo", `160000,${commitSha},vendor/sub`);
    git(submoduleRepo, "commit", "-q", "-m", "gitlink");
    const submodule = createRefSnapshots(submoduleRepo, "HEAD", "HEAD");
    expect(submodule.complete).toBe(false);
    expect(submodule.incompleteReasons).toEqual(["submodule_unsupported"]);
    submodule.dispose();

    const lfsRepo = makeDiffRepo({
      baseline: {
        "large.dat": [
          "version https://git-lfs.github.com/spec/v1",
          "oid sha256:" + "a".repeat(64),
          "size 123",
          "",
        ].join("\n"),
      },
    });
    const lfs = createRefSnapshots(lfsRepo, "HEAD", "HEAD");
    expect(lfs.complete).toBe(false);
    expect(lfs.incompleteReasons).toEqual(["lfs_unsupported"]);
    lfs.dispose();
  });
});
