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
  const state = createParserState(baseLabel, headLabel);
  for (const line of normalizedLines(patch)) {
    if (!consumeLine(state, line)) return null;
  }
  if (!state.sawDiff) return null;
  return [...state.files.values()]
    .map((file) => ({ ...file, ranges: mergeRanges(file.ranges) }))
    .sort((left, right) => compareText(left.path, right.path));
}

interface ParserState {
  files: Map<string, ChangedFileRanges>;
  baseMarker: string;
  headMarker: string;
  currentPath: string | null;
  oldHeaderPath: string | null;
  sawDiff: boolean;
}

function createParserState(baseLabel: string, headLabel: string): ParserState {
  return {
    files: new Map<string, ChangedFileRanges>(),
    baseMarker: `a/${normalizePath(baseLabel)}/`,
    headMarker: `b/${normalizePath(headLabel)}/`,
    currentPath: null,
    oldHeaderPath: null,
    sawDiff: false,
  };
}

function normalizedLines(patch: string): string[] {
  return patch.replace(/\r\n?/gu, "\n").split("\n");
}

function consumeLine(state: ParserState, line: string): boolean {
  if (line.startsWith("diff --git ")) return consumeDiffHeader(state, line);
  if (line.startsWith("--- ")) return consumeOldFileHeader(state, line);
  if (line.startsWith("+++ ")) return consumeNewFileHeader(state, line);
  if (line.startsWith("Binary files ") && line.endsWith(" differ")) return consumeBinaryLine(state);
  if (line.startsWith("@@")) return consumeHunkHeader(state, line);
  return true;
}

function consumeDiffHeader(state: ParserState, line: string): boolean {
  state.sawDiff = true;
  state.oldHeaderPath = null;
  const parsed = pathFromDiffHeader(line, state.baseMarker, state.headMarker);
  if (parsed === false) return false;
  state.currentPath = parsed;
  if (parsed) ensureFile(state.files, parsed);
  return true;
}

function consumeOldFileHeader(state: ParserState, line: string): boolean {
  const raw = line.slice(4);
  if (raw === "/dev/null") {
    state.oldHeaderPath = null;
    return true;
  }
  const parsed = pathFromMarker(raw, state.baseMarker);
  if (!parsed) return false;
  state.oldHeaderPath = parsed;
  return true;
}

function consumeNewFileHeader(state: ParserState, line: string): boolean {
  const raw = line.slice(4);
  const path = raw === "/dev/null" ? state.oldHeaderPath : pathFromMarker(raw, state.headMarker);
  if (!path) return false;
  state.currentPath = path;
  ensureFile(state.files, path);
  return true;
}

function consumeBinaryLine(state: ParserState): boolean {
  if (!state.currentPath) return false;
  ensureFile(state.files, state.currentPath).binary = true;
  return true;
}

function consumeHunkHeader(state: ParserState, line: string): boolean {
  if (!state.currentPath) return false;
  const range = headRange(line);
  if (range === false) return false;
  if (range) ensureFile(state.files, state.currentPath).ranges.push(range);
  return true;
}

function headRange(line: string): ChangedLineRange | null | false {
  const match = /\+(\d+)(?:,(\d+))?\s/u.exec(line);
  if (!match) return false;
  return changedRange(Number(match[1]), match[2] == null ? 1 : Number(match[2]));
}

function changedRange(start: number, count: number): ChangedLineRange | null | false {
  if (!Number.isSafeInteger(start)) return false;
  if (!Number.isSafeInteger(count)) return false;
  if (count < 0) return false;
  return count === 0 ? null : { start, end: start + count - 1 };
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
  return pathFromDestination(line, [
    ` b/${headMarker.slice(2)}`,
    ` b/${baseMarker.slice(2)}`,
  ]) ?? pathFromSource(line, [baseMarker, `a/${headMarker.slice(2)}`]);
}

function pathFromDestination(line: string, markers: readonly string[]): string | null | false {
  for (const marker of markers) {
    const path = pathAfterLastMarker(line, marker);
    if (path !== null) return path;
  }
  return null;
}

function pathAfterLastMarker(line: string, marker: string): string | null | false {
  const at = line.lastIndexOf(marker);
  return at < 0 ? null : validateRelativePath(line.slice(at + marker.length));
}

function pathFromSource(line: string, markers: readonly string[]): string | null | false {
  for (const marker of markers) {
    const path = pathAfterSourceMarker(line, marker);
    if (path !== null) return path;
  }
  return null;
}

function pathAfterSourceMarker(line: string, marker: string): string | null | false {
  const token = ` ${marker}`;
  const at = line.indexOf(token);
  if (at < 0) return null;
  const raw = line.slice(at + token.length);
  const destinationAt = raw.lastIndexOf(" b/");
  return validateRelativePath(destinationAt < 0 ? raw : raw.slice(0, destinationAt));
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
