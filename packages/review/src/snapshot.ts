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

interface SnapshotRequest {
  repoRoot: string;
  baseRef: string;
  headRef: string;
  overlayWorkingTree: boolean;
}

export interface CheckoutSnapshotRequest {
  baseRepoRoot: string;
  headRepoRoot: string;
  expectedBaseSha: string;
  expectedHeadSha: string;
}

/** Archive an explicit base plus HEAD overlaid with working/staged/untracked/deleted paths. */
export function createLocalSnapshots(repoRoot: string, baseRef = "HEAD"): SnapshotPairResult {
  return createSnapshots({ repoRoot, baseRef, headRef: "HEAD", overlayWorkingTree: true });
}

/** Archive two exact commit refs; used by CLI PR and managed App checkouts. */
export function createRefSnapshots(
  repoRoot: string,
  baseRef: string,
  headRef: string,
): SnapshotPairResult {
  return createSnapshots({ repoRoot, baseRef, headRef, overlayWorkingTree: false });
}

/** Archive HEAD from two distinct managed checkouts and verify each matches its webhook SHA. */
export function createCheckoutSnapshots(request: CheckoutSnapshotRequest): SnapshotPairResult {
  const root = mkdtempSync(join(tmpdir(), SNAPSHOT_PREFIX));
  const dispose = ownedDisposer(root);
  const refs = resolveCheckoutRefs(request);
  if (refs.reason) return failure(root, dispose, { base: refs.base, head: refs.head }, refs.reason);
  const extracted = materializeCheckoutSnapshots({ ...request, refs, root });
  if (extracted.reason) return failure(root, dispose, { base: refs.base, head: refs.head }, extracted.reason);
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

interface CheckoutRefs {
  base: ComparisonRef;
  head: ComparisonRef;
  baseSha: string | null;
  headSha: string | null;
  reason?: ComparisonIncompleteReason;
}

function resolveCheckoutRefs(request: CheckoutSnapshotRequest): CheckoutRefs {
  const unresolvedBase: ComparisonRef = { label: request.expectedBaseSha, sha: null };
  const unresolvedHead: ComparisonRef = { label: request.expectedHeadSha, sha: null };
  const baseSha = resolveCommit(request.baseRepoRoot, "HEAD");
  if (!baseSha || baseSha !== request.expectedBaseSha.toLowerCase()) {
    return { base: unresolvedBase, head: unresolvedHead, baseSha: null, headSha: null, reason: "base_unavailable" };
  }
  const base: ComparisonRef = { label: request.expectedBaseSha, sha: baseSha };
  const headSha = resolveCommit(request.headRepoRoot, "HEAD");
  if (!headSha || headSha !== request.expectedHeadSha.toLowerCase()) {
    return { base, head: unresolvedHead, baseSha, headSha: null, reason: "head_unavailable" };
  }
  const head: ComparisonRef = { label: request.expectedHeadSha, sha: headSha };
  const treeIssue = inspectTree(request.baseRepoRoot, baseSha, "base_unavailable")
    ?? inspectTree(request.headRepoRoot, headSha, "head_unavailable");
  return { base, head, baseSha, headSha, ...(treeIssue ? { reason: treeIssue } : {}) };
}

function materializeCheckoutSnapshots(input: CheckoutSnapshotRequest & { refs: CheckoutRefs; root: string }): MaterializedSnapshots {
  if (!input.refs.baseSha || !input.refs.headSha) return { reason: "diff_unavailable" };
  const baseRoot = join(input.root, "base");
  const headRoot = join(input.root, "head");
  mkdirSync(baseRoot);
  mkdirSync(headRoot);
  if (!archiveCommit(input.baseRepoRoot, input.refs.baseSha, baseRoot, { ownedRoot: input.root, archiveName: "base.tar" })) return { reason: "base_unavailable" };
  if (!archiveCommit(input.headRepoRoot, input.refs.headSha, headRoot, { ownedRoot: input.root, archiveName: "head.tar" })) return { reason: "head_unavailable" };
  const extractedIssue = inspectExtractedTree(baseRoot) ?? inspectExtractedTree(headRoot);
  return extractedIssue ? { reason: extractedIssue } : { baseRoot, headRoot };
}

function createSnapshots(request: SnapshotRequest): SnapshotPairResult {
  const root = mkdtempSync(join(tmpdir(), SNAPSHOT_PREFIX));
  const dispose = ownedDisposer(root);
  const unresolvedBase: ComparisonRef = { label: request.baseRef, sha: null };
  const unresolvedHead: ComparisonRef = {
    label: request.overlayWorkingTree ? "working-tree" : request.headRef,
    sha: null,
  };
  const refs = resolveSnapshotRefs({ request, unresolvedBase, unresolvedHead });
  if (refs.reason) return failure(root, dispose, { base: refs.base, head: refs.head }, refs.reason);
  const extracted = materializeSnapshots({ repoRoot: request.repoRoot, refs, root });
  if (extracted.reason) return failure(root, dispose, { base: refs.base, head: refs.head }, extracted.reason);

  if (request.overlayWorkingTree) {
    const overlayIssue = overlayWorkingChanges(request.repoRoot, extracted.headRoot);
    if (overlayIssue) return failure(root, dispose, { base: refs.base, head: refs.head }, overlayIssue);
    const finalIssue = inspectExtractedTree(extracted.headRoot);
    if (finalIssue) return failure(root, dispose, { base: refs.base, head: refs.head }, finalIssue);
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

function resolveSnapshotRefs(input: { request: SnapshotRequest; unresolvedBase: ComparisonRef; unresolvedHead: ComparisonRef }): SnapshotRefs {
  const baseSha = resolveCommit(input.request.repoRoot, input.request.baseRef);
  if (!baseSha) return { base: input.unresolvedBase, head: input.unresolvedHead, baseSha: null, headSha: null, reason: "base_unavailable" };
  const base: ComparisonRef = { label: input.request.baseRef, sha: baseSha };
  const headSha = resolveCommit(input.request.repoRoot, input.request.headRef);
  if (!headSha) return { base, head: input.unresolvedHead, baseSha, headSha: null, reason: "head_unavailable" };
  const head: ComparisonRef = input.request.overlayWorkingTree ? { label: "working-tree", sha: null } : { label: input.request.headRef, sha: headSha };
  const treeIssue = inspectTree(input.request.repoRoot, baseSha, "base_unavailable")
    ?? inspectTree(input.request.repoRoot, headSha, "head_unavailable");
  return { base, head, baseSha, headSha, ...(treeIssue ? { reason: treeIssue } : {}) };
}

type MaterializedSnapshots =
  | { baseRoot: string; headRoot: string; reason?: never }
  | { baseRoot?: never; headRoot?: never; reason: ComparisonIncompleteReason };

function materializeSnapshots(input: { repoRoot: string; refs: SnapshotRefs; root: string }): MaterializedSnapshots {
  if (!input.refs.baseSha || !input.refs.headSha) return { reason: "diff_unavailable" };
  const baseRoot = join(input.root, "base");
  const headRoot = join(input.root, "head");
  mkdirSync(baseRoot);
  mkdirSync(headRoot);
  if (!archiveCommit(input.repoRoot, input.refs.baseSha, baseRoot, { ownedRoot: input.root, archiveName: "base.tar" })) return { reason: "base_unavailable" };
  if (!archiveCommit(input.repoRoot, input.refs.headSha, headRoot, { ownedRoot: input.root, archiveName: "head.tar" })) return { reason: "head_unavailable" };
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
  archiveTarget: { ownedRoot: string; archiveName: string },
): boolean {
  const archive = join(archiveTarget.ownedRoot, archiveTarget.archiveName);
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
  refs: { base: ComparisonRef; head: ComparisonRef },
  reason: ComparisonIncompleteReason,
): SnapshotPairFailure {
  return {
    complete: false,
    root,
    baseRoot: null,
    headRoot: null,
    base: refs.base,
    head: refs.head,
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
