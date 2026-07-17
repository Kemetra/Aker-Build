import { execFileSync } from "node:child_process";
import {
  closeSync,
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, resolve, sep, win32 } from "node:path";
import type { ComparisonIncompleteReason, ComparisonRef } from "./types.js";

const SNAPSHOT_PREFIX = "aker-review-snapshot-";
const MAX_GIT_OUTPUT = 16 * 1024 * 1024;
const LFS_PREFIX = "version https://git-lfs.github.com/spec/v1";

interface SnapshotCommon {
  root: string;
  dispose: () => void;
  incompleteReasons: ComparisonIncompleteReason[];
}

export interface SnapshotPairSuccess extends SnapshotCommon {
  complete: true;
  baseRoot: string;
  headRoot: string;
  base: ComparisonRef;
  head: ComparisonRef;
  incompleteReasons: [];
}

export interface SnapshotPairFailure extends SnapshotCommon {
  complete: false;
  baseRoot: null;
  headRoot: null;
  base: ComparisonRef;
  head: ComparisonRef;
}

export type SnapshotPairResult = SnapshotPairSuccess | SnapshotPairFailure;

/** Archive an explicit base plus HEAD overlaid with working/staged/untracked/deleted paths. */
export function createLocalSnapshots(repoRoot: string, baseRef = "HEAD"): SnapshotPairResult {
  return createSnapshots(repoRoot, baseRef, "HEAD", true);
}

/** Archive two exact commit refs; used by CLI PR and managed App checkouts. */
export function createRefSnapshots(
  repoRoot: string,
  baseRef: string,
  headRef: string,
): SnapshotPairResult {
  return createSnapshots(repoRoot, baseRef, headRef, false);
}

/** Archive HEAD from two distinct managed checkouts and verify each matches its webhook SHA. */
export function createCheckoutSnapshots(
  baseRepoRoot: string,
  headRepoRoot: string,
  expectedBaseSha: string,
  expectedHeadSha: string,
): SnapshotPairResult {
  const root = mkdtempSync(join(tmpdir(), SNAPSHOT_PREFIX));
  const dispose = ownedDisposer(root);
  const baseRef: ComparisonRef = { label: expectedBaseSha, sha: null };
  const headRef: ComparisonRef = { label: expectedHeadSha, sha: null };
  const baseSha = resolveCommit(baseRepoRoot, "HEAD");
  if (!baseSha || baseSha !== expectedBaseSha.toLowerCase()) {
    return failure(root, dispose, baseRef, headRef, "base_unavailable");
  }
  const base: ComparisonRef = { label: expectedBaseSha, sha: baseSha };
  const headSha = resolveCommit(headRepoRoot, "HEAD");
  if (!headSha || headSha !== expectedHeadSha.toLowerCase()) {
    return failure(root, dispose, base, headRef, "head_unavailable");
  }
  const head: ComparisonRef = { label: expectedHeadSha, sha: headSha };
  const treeIssue = inspectTree(baseRepoRoot, baseSha, "base_unavailable")
    ?? inspectTree(headRepoRoot, headSha, "head_unavailable");
  if (treeIssue) return failure(root, dispose, base, head, treeIssue);

  const baseRoot = join(root, "base");
  const headRoot = join(root, "head");
  mkdirSync(baseRoot);
  mkdirSync(headRoot);
  if (!archiveCommit(baseRepoRoot, baseSha, baseRoot, root, "base.tar")) {
    return failure(root, dispose, base, head, "base_unavailable");
  }
  if (!archiveCommit(headRepoRoot, headSha, headRoot, root, "head.tar")) {
    return failure(root, dispose, base, head, "head_unavailable");
  }
  const extractedIssue = inspectExtractedTree(baseRoot) ?? inspectExtractedTree(headRoot);
  if (extractedIssue) return failure(root, dispose, base, head, extractedIssue);
  return {
    complete: true,
    root,
    baseRoot,
    headRoot,
    base,
    head,
    incompleteReasons: [],
    dispose,
  };
}

function createSnapshots(
  repoRoot: string,
  baseRef: string,
  headRef: string,
  overlayWorkingTree: boolean,
): SnapshotPairResult {
  const root = mkdtempSync(join(tmpdir(), SNAPSHOT_PREFIX));
  const dispose = ownedDisposer(root);
  const unresolvedBase: ComparisonRef = { label: baseRef, sha: null };
  const unresolvedHead: ComparisonRef = {
    label: overlayWorkingTree ? "working-tree" : headRef,
    sha: null,
  };
  const refs = resolveSnapshotRefs(repoRoot, baseRef, headRef, overlayWorkingTree, unresolvedBase, unresolvedHead);
  if (refs.reason) return failure(root, dispose, refs.base, refs.head, refs.reason);
  const extracted = materializeSnapshots(repoRoot, refs, root);
  if (extracted.reason) return failure(root, dispose, refs.base, refs.head, extracted.reason);

  if (overlayWorkingTree) {
    const overlayIssue = overlayWorkingChanges(repoRoot, extracted.headRoot);
    if (overlayIssue) return failure(root, dispose, refs.base, refs.head, overlayIssue);
    const finalIssue = inspectExtractedTree(extracted.headRoot);
    if (finalIssue) return failure(root, dispose, refs.base, refs.head, finalIssue);
  }

  return {
    complete: true,
    root,
    baseRoot: extracted.baseRoot,
    headRoot: extracted.headRoot,
    base: refs.base,
    head: refs.head,
    incompleteReasons: [],
    dispose,
  };
}

interface SnapshotRefs {
  base: ComparisonRef;
  head: ComparisonRef;
  baseSha: string | null;
  headSha: string | null;
  reason?: ComparisonIncompleteReason;
}

function resolveSnapshotRefs(
  repoRoot: string,
  baseRef: string,
  headRef: string,
  overlayWorkingTree: boolean,
  unresolvedBase: ComparisonRef,
  unresolvedHead: ComparisonRef,
): SnapshotRefs {
  const baseSha = resolveCommit(repoRoot, baseRef);
  if (!baseSha) return { base: unresolvedBase, head: unresolvedHead, baseSha: null, headSha: null, reason: "base_unavailable" };
  const base: ComparisonRef = { label: baseRef, sha: baseSha };
  const headSha = resolveCommit(repoRoot, headRef);
  if (!headSha) return { base, head: unresolvedHead, baseSha, headSha: null, reason: "head_unavailable" };
  const head: ComparisonRef = overlayWorkingTree ? { label: "working-tree", sha: null } : { label: headRef, sha: headSha };
  const treeIssue = inspectTree(repoRoot, baseSha, "base_unavailable")
    ?? inspectTree(repoRoot, headSha, "head_unavailable");
  return { base, head, baseSha, headSha, ...(treeIssue ? { reason: treeIssue } : {}) };
}

type MaterializedSnapshots =
  | { baseRoot: string; headRoot: string; reason?: never }
  | { baseRoot?: never; headRoot?: never; reason: ComparisonIncompleteReason };

function materializeSnapshots(repoRoot: string, refs: SnapshotRefs, root: string): MaterializedSnapshots {
  if (!refs.baseSha || !refs.headSha) return { reason: "diff_unavailable" };
  const baseRoot = join(root, "base");
  const headRoot = join(root, "head");
  mkdirSync(baseRoot);
  mkdirSync(headRoot);
  if (!archiveCommit(repoRoot, refs.baseSha, baseRoot, root, "base.tar")) return { reason: "base_unavailable" };
  if (!archiveCommit(repoRoot, refs.headSha, headRoot, root, "head.tar")) return { reason: "head_unavailable" };
  const extractedIssue = inspectExtractedTree(baseRoot) ?? inspectExtractedTree(headRoot);
  return extractedIssue ? { reason: extractedIssue } : { baseRoot, headRoot };
}

function resolveCommit(repoRoot: string, ref: string): string | null {
  if (!ref || /[\u0000-\u001f\u007f]/u.test(ref)) return null;
  try {
    const output = gitOutput(repoRoot, ["rev-parse", "--verify", "--end-of-options", `${ref}^{commit}`]).trim();
    return /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u.test(output) ? output : null;
  } catch {
    return null;
  }
}

function inspectTree(
  repoRoot: string,
  sha: string,
  unavailableReason: "base_unavailable" | "head_unavailable",
): ComparisonIncompleteReason | null {
  let output: string;
  try {
    output = gitOutput(repoRoot, ["ls-tree", "-r", "-z", "--full-tree", sha, "--"]);
  } catch {
    return unavailableReason;
  }
  for (const record of output.split("\0")) {
    if (!record) continue;
    const match = /^(\d{6})\s+(?:blob|commit)\s+[0-9a-f]+\t([\s\S]+)$/u.exec(record);
    if (!match || !safeRelativePath(match[2]!)) return "unsafe_path";
    if (match[1] === "120000") return "unsafe_path";
    if (match[1] === "160000") return "submodule_unsupported";
  }
  return null;
}

function archiveCommit(
  repoRoot: string,
  sha: string,
  destination: string,
  ownedRoot: string,
  archiveName: string,
): boolean {
  const archive = join(ownedRoot, archiveName);
  try {
    execFileSync("git", ["archive", "--format=tar", `--output=${archive}`, sha, "--"], {
      cwd: repoRoot,
      stdio: "ignore",
      windowsHide: true,
    });
    execFileSync("tar", ["-xf", archive, "-C", destination], {
      stdio: "ignore",
      windowsHide: true,
    });
    rmSync(archive, { force: true });
    return true;
  } catch {
    rmSync(archive, { force: true });
    return false;
  }
}

function overlayWorkingChanges(repoRoot: string, headRoot: string): ComparisonIncompleteReason | null {
  const paths = workingChangePaths(repoRoot);
  if (!paths) return "head_unavailable";
  for (const relativePath of paths) {
    const issue = overlayPath(repoRoot, headRoot, relativePath);
    if (issue) return issue;
  }
  return null;
}

function workingChangePaths(repoRoot: string): string[] | null {
  try {
    const tracked = nulPaths(gitOutput(repoRoot, ["diff", "--name-only", "-z", "--no-renames", "HEAD", "--"]));
    const untracked = nulPaths(gitOutput(repoRoot, ["ls-files", "--others", "--exclude-standard", "-z", "--"]));
    return [...new Set([...tracked, ...untracked])].sort(compareText);
  } catch {
    return null;
  }
}

function overlayPath(repoRoot: string, headRoot: string, relativePath: string): ComparisonIncompleteReason | null {
  if (!safeRelativePath(relativePath)) return "unsafe_path";
  const source = containedPath(repoRoot, relativePath);
  const destination = containedPath(headRoot, relativePath);
  if (!source || !destination) return "unsafe_path";
  if (!existsSync(source)) return removeDeletedSnapshotPath(headRoot, destination);
  const stat = lstatSync(source);
  if (!stat.isFile() || stat.isSymbolicLink()) return "unsafe_path";
  mkdirSync(dirname(destination), { recursive: true });
  copyFileSync(source, destination);
  return null;
}

function removeDeletedSnapshotPath(headRoot: string, destination: string): ComparisonIncompleteReason | null {
  if (existsSync(destination)) rmOwnedEntry(headRoot, destination);
  return null;
}

function inspectExtractedTree(root: string): ComparisonIncompleteReason | null {
  const pending = [root];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) return "unsafe_path";
      if (stat.isDirectory()) pending.push(path);
      else if (!stat.isFile()) return "unsafe_path";
      else if (isLfsPointer(path)) return "lfs_unsupported";
    }
  }
  return null;
}

function isLfsPointer(path: string): boolean {
  const descriptor = openSync(path, "r");
  try {
    const buffer = Buffer.alloc(128);
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytes).toString("utf8").startsWith(LFS_PREFIX);
  } finally {
    closeSync(descriptor);
  }
}

function safeRelativePath(relativePath: string): boolean {
  const normalized = relativePath.replace(/\\/gu, "/");
  return normalized.length > 0
    && !isAbsolute(normalized)
    && !win32.isAbsolute(normalized)
    && !/[\u0000-\u001f\u007f]/u.test(normalized)
    && !normalized.split("/").some((part) => part === "" || part === "." || part === "..");
}

function containedPath(root: string, relativePath: string): string | null {
  const normalizedRoot = resolve(root);
  const candidate = resolve(normalizedRoot, ...relativePath.replace(/\\/gu, "/").split("/"));
  return candidate.startsWith(`${normalizedRoot}${sep}`) ? candidate : null;
}

function nulPaths(output: string): string[] {
  return output.split("\0").filter(Boolean).map((path) => path.replace(/\\/gu, "/"));
}

function gitOutput(repoRoot: string, args: readonly string[]): string {
  return execFileSync("git", [...args], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: MAX_GIT_OUTPUT,
    windowsHide: true,
    stdio: ["ignore", "pipe", "ignore"],
  });
}

function failure(
  root: string,
  dispose: () => void,
  base: ComparisonRef,
  head: ComparisonRef,
  reason: ComparisonIncompleteReason,
): SnapshotPairFailure {
  return {
    complete: false,
    root,
    baseRoot: null,
    headRoot: null,
    base,
    head,
    incompleteReasons: [reason],
    dispose,
  };
}

function ownedDisposer(root: string): () => void {
  const ownedRoot = resolve(root);
  const temporaryRoot = resolve(tmpdir());
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    if (dirname(ownedRoot) !== temporaryRoot || !basename(ownedRoot).startsWith(SNAPSHOT_PREFIX)) {
      throw new Error("refusing to remove a non-owned snapshot root");
    }
    rmSync(ownedRoot, { recursive: true, force: true });
  };
}

function rmOwnedEntry(root: string, target: string): void {
  const normalizedRoot = resolve(root);
  const normalizedTarget = resolve(target);
  if (!normalizedTarget.startsWith(`${normalizedRoot}${sep}`)) {
    throw new Error("refusing to remove an entry outside the owned snapshot");
  }
  rmSync(normalizedTarget, { recursive: true, force: true });
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
