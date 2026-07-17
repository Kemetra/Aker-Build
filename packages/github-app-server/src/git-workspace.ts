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
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { Workspace } from "@aker-build/github-app";

export interface GitRunOptions {
  /** Variables added to the Git child only. Values must never be logged. */
  env?: Readonly<Record<string, string>>;
  timeoutMs?: number;
}

export interface GitRunner {
  run(args: string[], cwd: string, options?: GitRunOptions): { stdout: string; stderr: string; code: number };
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
      const wrapper = mkdtempSync(join(resolvedRoot, WORKSPACE_PREFIX));
      const wrapperResolved = realpathSync(wrapper);
      if (!isContained(resolvedRoot, wrapperResolved)) {
        throw new WorkspaceError("workspace root containment failed");
      }
      const nonce = randomBytes(16).toString("hex");
      const marker: Marker = { formatVersion: 1, createdAt: new Date().toISOString(), nonce };
      writeFileSync(join(wrapperResolved, WORKSPACE_MARKER), JSON.stringify(marker), {
        encoding: "utf8",
        flag: "wx",
      });
      const repoRoot = join(wrapperResolved, "repo");
      mkdirSync(repoRoot);
      const repoResolved = realpathSync(repoRoot);
      tracked.set(repoResolved, { repoRoot: repoResolved, wrapper: wrapperResolved, nonce });

      try {
        const init = deps.git.run(["init", "--quiet", repoResolved], resolvedRoot, { timeoutMs });
        if (init.code !== 0) throw new WorkspaceError("git init failed");

        const token = await deps.authToken();
        const authValue = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`;
        const gitEnv = {
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "http.extraheader",
          GIT_CONFIG_VALUE_0: authValue,
        };
        const url = deps.remoteUrl ? deps.remoteUrl(owner, repo) : `https://github.com/${owner}/${repo}.git`;
        const fetch = deps.git.run(["fetch", "--depth", "1", "--", url, headSha], repoResolved, {
          env: gitEnv,
          timeoutMs,
        });
        if (fetch.code !== 0) throw new WorkspaceError("git fetch failed for the PR head ref");
        const checkout = deps.git.run(["checkout", "--quiet", "FETCH_HEAD"], repoResolved, { timeoutMs });
        if (checkout.code !== 0) throw new WorkspaceError("git checkout failed");
        return repoResolved;
      } catch (error) {
        tracked.delete(repoResolved);
        removeOwnedWrapper(wrapperResolved, resolvedRoot, nonce);
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

export function cleanupStaleWorkspaces(args: {
  tmpRoot: string;
  maxAgeMs: number;
  nowMs?: number;
}): { removed: number; failed: number } {
  const root = resolve(args.tmpRoot);
  if (!existsSync(root)) return { removed: 0, failed: 0 };
  const resolvedRoot = realpathSync(root);
  const nowMs = args.nowMs ?? Date.now();
  let removed = 0;
  let failed = 0;

  for (const entry of readdirSync(resolvedRoot, { withFileTypes: true })) {
    if (!entry.name.startsWith(WORKSPACE_PREFIX) || !entry.isDirectory() || entry.isSymbolicLink()) continue;
    const candidate = join(resolvedRoot, entry.name);
    let marker: Marker;
    try {
      const wrapper = realpathSync(candidate);
      if (!isContained(resolvedRoot, wrapper)) continue;
      try {
        marker = readMarker(wrapper);
      } catch {
        // Prefix alone does not confer ownership. Unmarked or invalid wrappers are ignored.
        continue;
      }
      const createdAt = Date.parse(marker.createdAt);
      if (!Number.isFinite(createdAt) || nowMs - createdAt <= args.maxAgeMs) continue;
      validateOwnedWrapper(wrapper, resolvedRoot, marker.nonce);
      rmSync(wrapper, { recursive: true, force: true });
      removed += 1;
    } catch {
      failed += 1;
    }
  }
  return { removed, failed };
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
  if (
    value.formatVersion !== 1 ||
    typeof value.createdAt !== "string" ||
    typeof value.nonce !== "string" ||
    !/^[0-9a-f]{32}$/u.test(value.nonce)
  ) {
    throw new WorkspaceDisposalError("workspace marker is invalid");
  }
  return value as Marker;
}

function validateOwnedWrapper(wrapper: string, root: string, nonce: string): void {
  const stat = lstatSync(wrapper);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new WorkspaceDisposalError("workspace wrapper is invalid");
  const resolved = realpathSync(wrapper);
  if (!isContained(root, resolved)) throw new WorkspaceDisposalError("workspace is outside the managed root");
  if (dirname(resolved) !== root || !resolved.startsWith(join(root, WORKSPACE_PREFIX))) {
    throw new WorkspaceDisposalError("workspace wrapper is invalid");
  }
  const marker = readMarker(resolved);
  if (marker.nonce !== nonce) throw new WorkspaceDisposalError("workspace marker does not match");
}

function removeOwnedWrapper(wrapper: string, root: string, nonce: string): void {
  try {
    validateOwnedWrapper(wrapper, root, nonce);
    rmSync(wrapper, { recursive: true, force: true });
  } catch {
    // Never broaden cleanup after a validation failure.
  }
}
