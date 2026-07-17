import { randomBytes } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
  type Dirent,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Workspace } from "@aker-build/github-app";

export interface GitRunOptions {
  /** Variables added to the Git child only. Values must never be logged. */
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

/** The only Git operations the managed workspace is allowed to invoke. */
export type GitCommand =
  | { kind: "init"; repositoryPath: string }
  | { kind: "fetch"; remoteUrl: string; ref: string }
  | { kind: "checkout_fetch_head" };

export interface GitRunner {
  run(command: GitCommand, cwd: string, options?: GitRunOptions): { stdout: string; stderr: string; code: number };
}

export interface GitWorkspaceDeps {
  git: GitRunner;
  authToken: () => Promise<string>;
  tmpRoot?: string;
  gitTimeoutMs?: number;
  remoteUrl?: (owner: string, repo: string) => string;
}

export interface ManagedWorkspace extends Workspace {
  disposeAll(): Promise<void>;
  trackedCount(): number;
}

interface Marker {
  formatVersion: 1;
  createdAt: string;
  nonce: string;
}

interface TrackedWorkspace {
  repoRoot: string;
  wrapper: string;
  nonce: string;
}

interface CheckoutWorkspace extends TrackedWorkspace {
  resolvedRoot: string;
}

export const WORKSPACE_PREFIX = "aker-build-app-";
export const WORKSPACE_MARKER = ".aker-build-owner.json";
const DEFAULT_GIT_TIMEOUT_MS = 60_000;

export function makeGitWorkspace(deps: GitWorkspaceDeps): ManagedWorkspace {
  const tmpRoot = resolve(deps.tmpRoot ?? tmpdir());
  mkdirSync(tmpRoot, { recursive: true });
  const resolvedRoot = realpathSync(tmpRoot);
  const tracked = new Map<string, TrackedWorkspace>();
  const timeoutMs = deps.gitTimeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;

  const workspace: ManagedWorkspace = {
    async checkout({ owner, repo, headSha }) {
      assertRepositoryIdentity(owner, repo);
      const checkout = allocateWorkspace(resolvedRoot, tracked);

      try {
        await populateCheckout(checkout, { owner, repo, headSha }, deps, timeoutMs);
        return checkout.repoRoot;
      } catch (error) {
        tracked.delete(checkout.repoRoot);
        removeOwnedWrapper(checkout.wrapper, checkout.resolvedRoot, checkout.nonce);
        throw error;
      }
    },

    async dispose(repoRoot) {
      const resolvedRepo = resolveExisting(repoRoot);
      const record = resolvedRepo ? tracked.get(resolvedRepo) : undefined;
      if (!record) throw new WorkspaceDisposalError("workspace is not tracked");
      validateOwnedWrapper(record.wrapper, resolvedRoot, record.nonce);
      rmSync(record.wrapper, { recursive: true, force: true });
      tracked.delete(record.repoRoot);
    },

    async disposeAll() {
      for (const record of [...tracked.values()]) {
        try {
          validateOwnedWrapper(record.wrapper, resolvedRoot, record.nonce);
          rmSync(record.wrapper, { recursive: true, force: true });
          tracked.delete(record.repoRoot);
        } catch {
          // Refuse unsafe cleanup. The caller reports a fixed cleanup-failure metric.
        }
      }
    },

    trackedCount() {
      return tracked.size;
    },
  };

  return workspace;
}

function allocateWorkspace(resolvedRoot: string, tracked: Map<string, TrackedWorkspace>): CheckoutWorkspace {
  const wrapper = mkdtempSync(join(resolvedRoot, WORKSPACE_PREFIX));
  const wrapperResolved = realpathSync(wrapper);
  if (!isContained(resolvedRoot, wrapperResolved)) throw new WorkspaceError("workspace root containment failed");
  const nonce = randomBytes(16).toString("hex");
  writeWorkspaceMarker(wrapperResolved, nonce);
  const repoRoot = join(wrapperResolved, "repo");
  mkdirSync(repoRoot);
  const repoResolved = realpathSync(repoRoot);
  const checkout = { repoRoot: repoResolved, wrapper: wrapperResolved, nonce, resolvedRoot };
  tracked.set(repoResolved, checkout);
  return checkout;
}

function writeWorkspaceMarker(wrapper: string, nonce: string): void {
  const marker: Marker = { formatVersion: 1, createdAt: new Date().toISOString(), nonce };
  writeFileSync(join(wrapper, WORKSPACE_MARKER), JSON.stringify(marker), { encoding: "utf8", flag: "wx" });
}

async function populateCheckout(
  checkout: CheckoutWorkspace,
  identity: { owner: string; repo: string; headSha: string },
  deps: GitWorkspaceDeps,
  timeoutMs: number,
): Promise<void> {
  initializeRepository(checkout, deps, timeoutMs);
  const token = await deps.authToken();
  fetchHead(checkout, { ...identity, token }, deps, timeoutMs);
  checkoutFetchHead(checkout, deps, timeoutMs);
}

function initializeRepository(checkout: CheckoutWorkspace, deps: GitWorkspaceDeps, timeoutMs: number): void {
  const result = deps.git.run({ kind: "init", repositoryPath: checkout.repoRoot }, checkout.resolvedRoot, { timeoutMs });
  if (result.code !== 0) throw new WorkspaceError("git init failed");
}

function fetchHead(
  checkout: CheckoutWorkspace,
  request: { owner: string; repo: string; headSha: string; token: string },
  deps: GitWorkspaceDeps,
  timeoutMs: number,
): void {
  const remoteUrl = deps.remoteUrl?.(request.owner, request.repo) ?? `https://github.com/${request.owner}/${request.repo}.git`;
  const result = deps.git.run({ kind: "fetch", remoteUrl, ref: request.headSha }, checkout.repoRoot, {
    env: authorizationEnvironment(request.token),
    timeoutMs,
  });
  if (result.code !== 0) throw new WorkspaceError("git fetch failed for the PR head ref");
}

function authorizationEnvironment(token: string): Record<string, string> {
  const authValue = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.extraheader",
    GIT_CONFIG_VALUE_0: authValue,
  };
}

function checkoutFetchHead(checkout: CheckoutWorkspace, deps: GitWorkspaceDeps, timeoutMs: number): void {
  const result = deps.git.run({ kind: "checkout_fetch_head" }, checkout.repoRoot, { timeoutMs });
  if (result.code !== 0) throw new WorkspaceError("git checkout failed");
}

export function cleanupStaleWorkspaces(args: {
  tmpRoot: string;
  maxAgeMs: number;
  nowMs?: number;
}): { removed: number; failed: number } {
  const root = resolve(args.tmpRoot);
  if (!existsSync(root)) return { removed: 0, failed: 0 };
  const context: CleanupContext = { root: realpathSync(root), maxAgeMs: args.maxAgeMs, nowMs: args.nowMs ?? Date.now() };
  return readdirSync(context.root, { withFileTypes: true }).reduce(cleanupWorkspaceEntry(context), { removed: 0, failed: 0 });
}

interface CleanupContext {
  root: string;
  maxAgeMs: number;
  nowMs: number;
}

interface CleanupStats {
  removed: number;
  failed: number;
}

function cleanupWorkspaceEntry(context: CleanupContext): (stats: CleanupStats, entry: Dirent) => CleanupStats {
  return (stats, entry) => updateCleanupStats(stats, cleanWorkspaceEntry(context, entry));
}

function updateCleanupStats(stats: CleanupStats, result: "removed" | "failed" | "ignored"): CleanupStats {
  if (result === "removed") return { ...stats, removed: stats.removed + 1 };
  if (result === "failed") return { ...stats, failed: stats.failed + 1 };
  return stats;
}

function cleanWorkspaceEntry(context: CleanupContext, entry: Dirent): "removed" | "failed" | "ignored" {
  const candidate = workspaceCandidate(context.root, entry);
  if (!candidate) return "ignored";
  try {
    const workspace = ownedWorkspace(candidate, context.root);
    if (!workspace || !isStale(workspace.marker, context)) return "ignored";
    validateOwnedWrapper(workspace.wrapper, context.root, workspace.marker.nonce);
    rmSync(workspace.wrapper, { recursive: true, force: true });
    return "removed";
  } catch {
    return "failed";
  }
}

function workspaceCandidate(root: string, entry: Dirent): string | null {
  if (!entry.name.startsWith(WORKSPACE_PREFIX)) return null;
  if (!entry.isDirectory()) return null;
  if (entry.isSymbolicLink()) return null;
  return join(root, entry.name);
}

function ownedWorkspace(candidate: string, root: string): { wrapper: string; marker: Marker } | null {
  const wrapper = realpathSync(candidate);
  if (!isContained(root, wrapper)) return null;
  try {
    return { wrapper, marker: readMarker(wrapper) };
  } catch {
    // Prefix alone does not confer ownership. Unmarked or invalid wrappers are ignored.
    return null;
  }
}

function isStale(marker: Marker, context: CleanupContext): boolean {
  const createdAt = Date.parse(marker.createdAt);
  return Number.isFinite(createdAt) && context.nowMs - createdAt > context.maxAgeMs;
}

export class WorkspaceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceError";
  }
}

export class WorkspaceDisposalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkspaceDisposalError";
  }
}

function assertRepositoryIdentity(owner: string, repo: string): void {
  const validOwner = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u.test(owner);
  const validRepo = /^[A-Za-z0-9._][A-Za-z0-9._-]{0,99}$/u.test(repo) && repo !== "." && repo !== "..";
  if (!validOwner || !validRepo) throw new WorkspaceError("invalid repository identity");
}

function resolveExisting(path: string): string | null {
  try {
    return realpathSync(path);
  } catch {
    return null;
  }
}

function isContained(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel !== "" && !rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`) && rel !== ".." && !isAbsolute(rel);
}

function readMarker(wrapper: string): Marker {
  const markerPath = join(wrapper, WORKSPACE_MARKER);
  const stat = lstatSync(markerPath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new WorkspaceDisposalError("workspace marker is invalid");
  const value = JSON.parse(readFileSync(markerPath, "utf8")) as Partial<Marker>;
  if (!isValidMarker(value)) throw new WorkspaceDisposalError("workspace marker is invalid");
  return value;
}

function isValidMarker(value: Partial<Marker>): value is Marker {
  return (
    value.formatVersion === 1 &&
    typeof value.createdAt === "string" &&
    typeof value.nonce === "string" &&
    /^[0-9a-f]{32}$/u.test(value.nonce)
  );
}

function validateOwnedWrapper(wrapper: string, root: string, nonce: string): void {
  const resolved = resolveOwnedWrapperPath(wrapper, root);
  const marker = readMarker(resolved);
  if (marker.nonce !== nonce) throw new WorkspaceDisposalError("workspace marker does not match");
}

function resolveOwnedWrapperPath(wrapper: string, root: string): string {
  const stat = lstatSync(wrapper);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new WorkspaceDisposalError("workspace wrapper is invalid");
  const resolved = realpathSync(wrapper);
  if (!isContained(root, resolved)) throw new WorkspaceDisposalError("workspace is outside the managed root");
  if (!isDirectWorkspaceChild(resolved, root)) throw new WorkspaceDisposalError("workspace wrapper is invalid");
  return resolved;
}

function isDirectWorkspaceChild(resolved: string, root: string): boolean {
  return dirname(resolved) === root && resolved.startsWith(join(root, WORKSPACE_PREFIX));
}

function removeOwnedWrapper(wrapper: string, root: string, nonce: string): void {
  try {
    validateOwnedWrapper(wrapper, root, nonce);
    rmSync(wrapper, { recursive: true, force: true });
  } catch {
    // Never broaden cleanup after a validation failure.
  }
}
