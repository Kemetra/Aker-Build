import { spawnSync } from "node:child_process";
import { basename, dirname, isAbsolute, resolve, win32 } from "node:path";
import type { ChangedFileRanges, ChangedLineRange, ComparisonIncompleteReason } from "./types.js";

const MAX_DIFF_BYTES = 16 * 1024 * 1024;

export interface DiffRunResult {
  status: number | null;
  stdout: string;
}

export type DiffRunner = (cwd: string, args: readonly string[]) => DiffRunResult;

export interface TreeDiffResult {
  changedFiles: ChangedFileRanges[];
  complete: boolean;
  incompleteReasons: ComparisonIncompleteReason[];
}

/**
 * Compare two owned sibling snapshots without touching Git metadata. Exit 0 is equal, exit 1 is a
 * patch, and every other outcome is deliberately collapsed to the closed public failure reason.
 */
export function diffTrees(
  baseRoot: string,
  headRoot: string,
  runner: DiffRunner = runGitDiff,
): TreeDiffResult {
  const base = resolve(baseRoot);
  const head = resolve(headRoot);
  const parent = dirname(base);
  if (parent !== dirname(head) || base === head) return incompleteDiff();

  const baseLabel = basename(base);
  const headLabel = basename(head);
  let result: DiffRunResult;
  try {
    result = runner(parent, [
      "-c", "core.quotePath=false",
      "diff", "--no-index", "--unified=0", "--no-renames", "--no-ext-diff",
      "--src-prefix=a/", "--dst-prefix=b/", "--", baseLabel, headLabel,
    ]);
  } catch {
    return incompleteDiff();
  }

  if (result.status === 0) {
    return { changedFiles: [], complete: true, incompleteReasons: [] };
  }
  if (result.status !== 1) return incompleteDiff();
  const changedFiles = parseNoIndexDiff(result.stdout, baseLabel, headLabel);
  if (changedFiles == null || changedFiles.length === 0) return incompleteDiff();
  return { changedFiles, complete: true, incompleteReasons: [] };
}

/** Parse a Git zero-context patch. Null means malformed or unsafe, never a partial answer. */
export function parseNoIndexDiff(
  patch: string,
  baseLabel: string,
  headLabel: string,
): ChangedFileRanges[] | null {
  const files = new Map<string, ChangedFileRanges>();
  const baseMarker = `a/${normalizePath(baseLabel)}/`;
  const headMarker = `b/${normalizePath(headLabel)}/`;
  let currentPath: string | null = null;
  let oldHeaderPath: string | null = null;
  let sawDiff = false;

  for (const line of patch.replace(/\r\n?/gu, "\n").split("\n")) {
    if (line.startsWith("diff --git ")) {
      sawDiff = true;
      oldHeaderPath = null;
      const parsed = pathFromDiffHeader(line, baseMarker, headMarker);
      if (parsed === false) return null;
      currentPath = parsed;
      if (currentPath) ensureFile(files, currentPath);
      continue;
    }

    if (line.startsWith("--- ")) {
      const raw = line.slice(4);
      if (raw === "/dev/null") oldHeaderPath = null;
      else {
        const parsed = pathFromMarker(raw, baseMarker);
        if (!parsed) return null;
        oldHeaderPath = parsed;
      }
      continue;
    }

    if (line.startsWith("+++ ")) {
      const raw = line.slice(4);
      if (raw === "/dev/null") {
        if (!oldHeaderPath) return null;
        currentPath = oldHeaderPath;
      } else {
        const parsed = pathFromMarker(raw, headMarker);
        if (!parsed) return null;
        currentPath = parsed;
      }
      ensureFile(files, currentPath);
      continue;
    }

    if (line.startsWith("Binary files ") && line.endsWith(" differ")) {
      if (!currentPath) return null;
      ensureFile(files, currentPath).binary = true;
      continue;
    }

    if (line.startsWith("@@")) {
      if (!currentPath) return null;
      const match = /\+(\d+)(?:,(\d+))?\s/u.exec(line);
      if (!match) return null;
      const start = Number(match[1]);
      const count = match[2] == null ? 1 : Number(match[2]);
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(count) || count < 0) return null;
      if (count > 0) ensureFile(files, currentPath).ranges.push({ start, end: start + count - 1 });
    }
  }

  if (!sawDiff) return null;
  return [...files.values()]
    .map((file) => ({ ...file, ranges: mergeRanges(file.ranges) }))
    .sort((left, right) => compareText(left.path, right.path));
}

/** Changed-line lookup shared by classification and annotation eligibility. */
export function isLineChanged(
  changedFiles: readonly ChangedFileRanges[],
  path: string,
  line: number | null,
): boolean {
  if (line == null || line < 1) return false;
  const normalized = normalizePath(path);
  const file = changedFiles.find((candidate) => candidate.path === normalized);
  return file != null && !file.binary && file.ranges.some((range) => line >= range.start && line <= range.end);
}

function runGitDiff(cwd: string, args: readonly string[]): DiffRunResult {
  const result = spawnSync("git", [...args], {
    cwd,
    encoding: "utf8",
    maxBuffer: MAX_DIFF_BYTES,
    windowsHide: true,
  });
  return { status: result.status, stdout: result.stdout ?? "" };
}

function incompleteDiff(): TreeDiffResult {
  return { changedFiles: [], complete: false, incompleteReasons: ["diff_unavailable"] };
}

function pathFromDiffHeader(
  line: string,
  baseMarker: string,
  headMarker: string,
): string | null | false {
  // Added/deleted no-index entries may use the same directory label on both header sides, so
  // accept either known label after the destination `b/` prefix and prefer that unambiguous tail.
  const destinationMarkers = [
    ` b/${headMarker.slice(2)}`,
    ` b/${baseMarker.slice(2)}`,
  ];
  for (const marker of destinationMarkers) {
    const at = line.lastIndexOf(marker);
    if (at >= 0) return validateRelativePath(line.slice(at + marker.length));
  }
  const sourceMarkers = [baseMarker, `a/${headMarker.slice(2)}`];
  for (const marker of sourceMarkers) {
    const token = ` ${marker}`;
    const at = line.indexOf(token);
    if (at >= 0) {
      const raw = line.slice(at + token.length);
      const destinationAt = raw.lastIndexOf(" b/");
      return validateRelativePath(destinationAt >= 0 ? raw.slice(0, destinationAt) : raw);
    }
  }
  return null;
}

function pathFromMarker(raw: string, marker: string): string | null {
  if (!raw.startsWith(marker)) return null;
  const parsed = validateRelativePath(raw.slice(marker.length));
  return typeof parsed === "string" ? parsed : null;
}

function validateRelativePath(raw: string): string | null | false {
  const path = normalizePath(raw);
  if (
    path.length === 0
    || isAbsolute(path)
    || win32.isAbsolute(path)
    || /[\u0000-\u001f\u007f]/u.test(path)
    || path.split("/").some((part) => part === ".." || part.length === 0)
  ) return false;
  return path;
}

function ensureFile(files: Map<string, ChangedFileRanges>, path: string): ChangedFileRanges {
  let file = files.get(path);
  if (!file) {
    file = { path, ranges: [], binary: false };
    files.set(path, file);
  }
  return file;
}

function mergeRanges(ranges: readonly ChangedLineRange[]): ChangedLineRange[] {
  const sorted = [...ranges].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: ChangedLineRange[] = [];
  for (const range of sorted) {
    const previous = merged[merged.length - 1];
    if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
    else merged.push({ ...range });
  }
  return merged;
}

function normalizePath(path: string): string {
  return path.replace(/\\/gu, "/").replace(/^\.\//u, "");
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
