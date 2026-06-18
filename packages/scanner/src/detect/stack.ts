import { fileExists, readFileSafe } from "../io.js";
import type { DetectionSignal } from "../types.js";

export interface StackDetection {
  runtime: string | null;
  package_manager: string | null;
  frameworks: string[];
  signals: DetectionSignal[];
}

const FRAMEWORK_DEPS: Record<string, string> = {
  next: "nextjs",
  "@nestjs/core": "nestjs",
  nestjs: "nestjs",
  express: "express",
  fastify: "fastify",
  "@angular/core": "angular",
  vue: "vue",
  react: "react",
  svelte: "svelte",
};

/** Detect runtime / package manager / frameworks from high-signal manifests at the repo root. */
export function detectStack(root: string): StackDetection {
  const signals: DetectionSignal[] = [];
  let runtime: string | null = null;
  let package_manager: string | null = null;
  const frameworks = new Set<string>();

  if (fileExists(root, "package.json")) {
    runtime = "node";
    signals.push({ type: "file", path: "package.json", signal: "package_json_present", confidence: "high" });
    const raw = readFileSafe(root, "package.json");
    if (raw) {
      try {
        const pkg = JSON.parse(raw) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        for (const dep of Object.keys(deps)) {
          const fw = FRAMEWORK_DEPS[dep];
          if (fw) frameworks.add(fw);
        }
      } catch {
        // malformed manifest — runtime still known, frameworks left empty (honest)
      }
    }
  } else if (fileExists(root, "go.mod")) {
    runtime = "go";
    signals.push({ type: "file", path: "go.mod", signal: "go_mod_present", confidence: "high" });
  } else if (fileExists(root, "pyproject.toml")) {
    runtime = "python";
    signals.push({ type: "file", path: "pyproject.toml", signal: "pyproject_present", confidence: "high" });
  }

  if (fileExists(root, "pnpm-lock.yaml") || fileExists(root, "pnpm-workspace.yaml")) {
    package_manager = "pnpm";
    signals.push({ type: "file", path: "pnpm-workspace.yaml", signal: "pnpm_present", confidence: "high" });
  } else if (fileExists(root, "package-lock.json")) {
    package_manager = "npm";
    signals.push({ type: "file", path: "package-lock.json", signal: "npm_lock_present", confidence: "high" });
  } else if (fileExists(root, "yarn.lock")) {
    package_manager = "yarn";
    signals.push({ type: "file", path: "yarn.lock", signal: "yarn_lock_present", confidence: "high" });
  }

  return {
    runtime,
    package_manager,
    frameworks: [...frameworks].sort(),
    signals,
  };
}
