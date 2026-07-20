import type { Coverage, CoverageCapability } from "@aker-build/project-map";
import { readFileSafe } from "../io.js";

export const SOURCE_FILE = /\.(ts|js|tsx|jsx|py|go|rb)$/i;

export interface RouteSignatures {
  definition: RegExp;
  admin?: RegExp;
  adminPath?: RegExp;
}

export interface AuthSignatures {
  guard: RegExp;
  guardKind?: "decorator";
  role?: RegExp;
  roleKind?: "decorator";
}

export interface DataAccessSignatures {
  query: RegExp;
}

export interface SignaturePack {
  id: string;
  capabilities: readonly CoverageCapability[];
  path?: RegExp;
  markers: readonly RegExp[];
  routes?: RouteSignatures;
  auth?: AuthSignatures;
  dataAccess?: DataAccessSignatures;
}

const ADMIN_LITERAL = /['"`]\/?admin(?:\/|['"`])/i;
const RAW_SQL =
  /\b(SELECT|UPDATE|DELETE|INSERT)\b[\s\S]{0,80}\bFROM\b|\bUPDATE\b\s+\w+\s+\bSET\b/i;

export const SIGNATURE_PACKS: readonly SignaturePack[] = [
  {
    id: "django",
    capabilities: ["auth", "data_access", "routes"],
    markers: [/\bfrom\s+django\b|\bimport\s+django\b|\.objects\.(?:all|filter|get|exclude|create|update|delete)\s*\(/i],
    routes: {
      definition: /\b(?:path|re_path)\s*\(/,
      admin: ADMIN_LITERAL,
    },
    auth: {
      guard: /@(?:login_required|permission_required)\b|\bLoginRequiredMixin\b/,
      guardKind: "decorator",
      role: /@permission_required\b|\bPermissionRequiredMixin\b|\buser_passes_test\b/,
      roleKind: "decorator",
    },
    dataAccess: {
      query: /\b[A-Za-z_]\w*\.objects\.(?:all|filter|get|exclude|create|update|delete)\s*\(/,
    },
  },
  {
    id: "express",
    capabilities: ["auth", "routes"],
    markers: [/\bfrom\s+['"]express['"]|\brequire\s*\(\s*['"]express['"]\s*\)|\b(?:app|router)\.(?:use|get|post|put|patch|delete)\s*\(/i],
    routes: {
      definition: /\b(?:app|router)\.(?:get|post|put|patch|delete)\s*\(/i,
      admin: ADMIN_LITERAL,
    },
    auth: {
      guard: /\b(?:requireAuth|authenticate|isAuthenticated|authGuard|ensureAuth|withAuth|verifyToken|jwt)\b/i,
      role: /\b(?:requireRole|isAdmin|adminOnly|hasRole|checkRole|authorize)\b/i,
    },
  },
  {
    id: "fastify",
    capabilities: ["auth", "routes"],
    markers: [/\bfrom\s+['"]fastify['"]|\brequire\s*\(\s*['"]fastify['"]\s*\)|\bFastifyInstance\b|\bfastify\.(?:addHook|get|post|put|patch|delete)\s*\(/i],
    routes: {
      definition: /\b(?:fastify|server)\.(?:get|post|put|patch|delete)\s*\(/i,
      admin: ADMIN_LITERAL,
    },
    auth: {
      guard: /\b(?:addHook|preHandler|onRequest|authenticate|verifyToken|jwtVerify)\b/i,
      role: /\b(?:requireRole|isAdmin|adminOnly|hasRole|authorize)\b/i,
    },
  },
  {
    id: "generic-js-db",
    capabilities: ["data_access"],
    markers: [/\b(?:db|knex|sequelize|orm|repo|repository|client|conn|connection|pool|tx|trx|store|datastore|typeorm|drizzle)\b[\w.]*\.\s*(?:find|findMany|findFirst|findUnique|findOne|select|update|delete|insert|create)\s*\(/i],
    dataAccess: {
      query: /\b(?:db|knex|sequelize|orm|repo|repository|client|conn|connection|pool|tx|trx|store|datastore|typeorm|drizzle)\b[\w.]*\.\s*(?:find|findMany|findFirst|findUnique|findOne|select|update|delete|insert|create)\s*\(/i,
    },
  },
  {
    id: "mongoose",
    capabilities: ["data_access"],
    markers: [/\bmongoose\b/i, /\bfrom\s+['"][^'"]*(?:models?|schemas?)[^'"]*['"]/i, /\brequire\s*\(\s*['"][^'"]*(?:models?|schemas?)[^'"]*['"]\s*\)/i],
    dataAccess: {
      query: /\b[A-Z][A-Za-z0-9_]*\.(?:find|findOne|findById|findOneAndUpdate|updateOne|updateMany|deleteOne|deleteMany|countDocuments|exists|create)\s*\(/,
    },
  },
  {
    id: "nestjs",
    capabilities: ["auth", "routes"],
    markers: [/@(?:Controller|Get|Post|Put|Patch|Delete|UseGuards|Roles)\b/, /\bfrom\s+['"]@nestjs\//],
    routes: {
      definition: /@(?:Get|Post|Put|Patch|Delete)\s*\(/,
      admin: ADMIN_LITERAL,
    },
    auth: {
      guard: /@UseGuards\s*\(|\bCanActivate\b/,
      guardKind: "decorator",
      role: /@Roles\s*\(|\bRolesGuard\b/,
      roleKind: "decorator",
    },
  },
  {
    id: "nextjs-app-router",
    capabilities: ["routes"],
    path: /(?:^|\/)app(?:\/[^/]+)*\/route\.(?:ts|js)$/i,
    markers: [],
    routes: {
      definition: /\bexport\s+(?:async\s+)?function\s+(?:GET|POST|PUT|PATCH|DELETE)\b/,
      adminPath: /(?:^|\/)admin(?:\/|$)/i,
    },
  },
  {
    id: "prisma",
    capabilities: ["data_access"],
    markers: [/\bprisma\b[\w.]*\.\s*(?:findMany|findFirst|findUnique|findOne|create|update|delete)\s*\(/i],
    dataAccess: {
      query: /\bprisma\b[\w.]*\.\s*(?:findMany|findFirst|findUnique|findOne|create|update|delete)\s*\(/i,
    },
  },
  {
    id: "raw-sql",
    capabilities: ["data_access"],
    markers: [RAW_SQL],
    dataAccess: { query: RAW_SQL },
  },
  {
    id: "sqlalchemy",
    capabilities: ["data_access"],
    markers: [/\bsqlalchemy\b/i, /\bfrom\s+sqlalchemy\b/i],
    dataAccess: {
      query: /\b(?:session|db\.session)\.query\s*\(|\bselect\s*\(/i,
    },
  },
] as const;

function matches(regex: RegExp, value: string): boolean {
  regex.lastIndex = 0;
  return regex.test(value);
}

/** Strip common line/block comments while preserving line numbers for evidence locations. */
export function stripComments(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (comment) => " ".repeat(comment.length))
    .replace(/^\s*#[^\n]*/gm, (comment) => " ".repeat(comment.length));
}

export function packMatchesFile(pack: SignaturePack, path: string, content: string): boolean {
  if (pack.path && matches(pack.path, path)) return true;
  return pack.markers.some((marker) => matches(marker, content));
}

export function matchingSignaturePacks(path: string, content: string): SignaturePack[] {
  return SIGNATURE_PACKS.filter((pack) => packMatchesFile(pack, path, content));
}

export function detectCoverage(root: string, files: string[]): Coverage {
  const matchedFiles = new Map<string, Set<string>>();
  let sourceFilesExamined = 0;

  for (const path of files) {
    if (!SOURCE_FILE.test(path)) continue;
    const content = readFileSafe(root, path);
    if (content === null) continue;
    sourceFilesExamined++;
    for (const pack of matchingSignaturePacks(path, stripComments(content))) {
      const paths = matchedFiles.get(pack.id) ?? new Set<string>();
      paths.add(path);
      matchedFiles.set(pack.id, paths);
    }
  }

  const packs = SIGNATURE_PACKS
    .filter((pack) => matchedFiles.has(pack.id))
    .map((pack) => ({
      id: pack.id,
      capabilities: [...pack.capabilities].sort(),
      matched_files: matchedFiles.get(pack.id)?.size ?? 0,
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

  return { source_files_examined: sourceFilesExamined, packs };
}
