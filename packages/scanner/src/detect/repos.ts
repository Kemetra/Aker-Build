import { readFileSafe, fileExists } from "../io.js";
import type { DetectionSignal } from "../types.js";

export interface DetectedRepo {
  name: string;
  path: string;
  type: string;
  owns: string[];
}

export interface RepoDetection {
  repos: DetectedRepo[];
  signals: DetectionSignal[];
}

const MONOREPO_DIRS = ["apps", "packages", "services"];

const FRONTEND_HINTS = ["next", "react", "vue", "@angular/core", "svelte"];
const WORKER_HINTS = ["bullmq", "bull", "agenda"];

function repoType(root: string, relDir: string): string {
  const raw = readFileSafe(root, relDir === "." ? "package.json" : `${relDir}/package.json`);
  if (raw) {
    try {
      const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
      if (deps.some((d) => WORKER_HINTS.includes(d))) return "worker";
      if (deps.some((d) => FRONTEND_HINTS.includes(d))) return "frontend";
    } catch {
      /* malformed — fall through */
    }
  }
  return "backend";
}

/**
 * Detect repos/areas. A monorepo (apps/* + packages/* with their own manifests) yields one repo per
 * sub-package; a flat repo yields a single root entry. Returns repos sorted by path (determinism).
 */
export function detectRepos(root: string, listFiles: (root: string) => string[]): RepoDetection {
  const signals: DetectionSignal[] = [];
  const files = listFiles(root);
  const subManifests = files.filter(
    (f) => f.endsWith("/package.json") && MONOREPO_DIRS.includes(f.split("/")[0] ?? ""),
  );

  if (subManifests.length > 0) {
    const repos: DetectedRepo[] = subManifests.map((mf) => {
      const dir = mf.slice(0, -"/package.json".length);
      const name = dir.split("/").pop() ?? dir;
      signals.push({ type: "file", path: mf, signal: "monorepo_package_present", confidence: "high" });
      return { name, path: dir, type: repoType(root, dir), owns: [] };
    });
    repos.sort((a, b) => a.path.localeCompare(b.path));
    return { repos, signals };
  }

  // Flat repo: a single root entry only if there's a root manifest.
  if (fileExists(root, "package.json") || fileExists(root, "go.mod") || fileExists(root, "pyproject.toml")) {
    signals.push({ type: "file", path: "package.json", signal: "root_manifest_present", confidence: "high" });
    return { repos: [{ name: "root", path: ".", type: repoType(root, "."), owns: [] }], signals };
  }

  // No manifest anywhere → no repos (honest empty; FR-006).
  return { repos: [], signals };
}
