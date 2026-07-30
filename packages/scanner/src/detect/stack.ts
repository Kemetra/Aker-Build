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
  // Data-access libraries. The flagship detector keys entirely on ORM idioms, so coverage
  // reporting is meaningless without them: a Prisma repo that lists only "express" says nothing
  // about whether its queries were understood.
  "@prisma/client": "prisma",
  prisma: "prisma",
  mongoose: "mongoose",
  knex: "knex",
  sequelize: "sequelize",
  typeorm: "typeorm",
  "drizzle-orm": "drizzle",
};

/**
 * Frameworks whose idioms the current detectors actually recognise. It must name what is truly
 * covered, never what is aspirationally supported — every entry here is backed by a pattern in a
 * detector and a benchmark case. Growing this list ships together with the signatures that justify
 * it.
 *
 * express — g4-security.ts ROUTE_DEF (app/router/server.get|post|...).
 * prisma, knex, sequelize, typeorm, drizzle — data-access.ts ORM_QUERY receiver allow-list.
 * mongoose — data-access.ts MODEL_QUERY (PascalCase model receiver).
 *
 * Deliberately absent: nextjs (route handlers are `export async function GET`, unmatched by
 * ROUTE_DEF), nestjs (decorator-based), fastify (hook-based), and all UI frameworks — they are
 * detected but not understood, which is exactly what `uncovered` is for.
 */
const COVERED_FRAMEWORKS = new Set([
  "express",
  "prisma",
  "mongoose",
  "knex",
  "sequelize",
  "typeorm",
  "drizzle",
]);

export interface CoverageReport {
  covered: string[];
  uncovered: string[];
}

/**
 * Partition detected frameworks into those the detectors understand and those they do not.
 * Read-only and judgment-free. This is the anti-false-confidence field: it lets "no findings" be
 * rendered as "no findings in covered frameworks", so an unrecognised stack reads as silence
 * rather than as safety. Both lists are sorted for determinism.
 */
export function partitionCoverage(frameworks: string[]): CoverageReport {
  const covered: string[] = [];
  const uncovered: string[] = [];
  for (const fw of frameworks) {
    (COVERED_FRAMEWORKS.has(fw) ? covered : uncovered).push(fw);
  }
  return { covered: covered.sort(), uncovered: uncovered.sort() };
}

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
