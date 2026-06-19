import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

export const CONFIG_FILENAMES = ["tenantguard.config.json", "tenantguard.config.yaml"] as const;
export const CONFIG_VERSION = 1;

const severitySchema = z.enum(["low", "medium", "high", "critical"]);
const suppressionSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1).optional(),
    finding_id: z.string().min(1).optional(),
    reason: z.string().min(1),
    owner: z.string().min(1),
    expires: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .strict()
  .superRefine((suppression, ctx) => {
    if (!suppression.path && !suppression.finding_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "suppression must define path or finding_id",
        path: ["path"],
      });
    }
  });

export const tenantGuardConfigSchema = z.object({
  version: z.literal(CONFIG_VERSION),
  project: z
    .object({
      name: z.string().min(1).optional(),
      type: z.string().min(1).optional(),
    })
    .strict()
    .optional(),
  paths: z
    .object({
      include: z.array(z.string().min(1)).optional(),
      exclude: z.array(z.string().min(1)).optional(),
    })
    .strict()
    .optional(),
  gates: z
    .record(
      z.object({
        severity: severitySchema.optional(),
        suppressions: z.array(suppressionSchema).optional(),
        /**
         * Minimum confidence tier to SURFACE for this gate (P2). Findings below it are suppressed
         * with an audited record — never silently dropped. `confirmed` = only high-confidence
         * findings surface; `suspected` (default) = surface everything.
         */
        min_tier: z.enum(["confirmed", "suspected"]).optional(),
      }).strict(),
    )
    .optional(),
  specs: z
    .object({
      adapter: z.enum(["auto", "off", "spec-kit"]).optional(),
    })
    .strict()
    .optional(),
}).strict();

export type TenantGuardConfig = z.infer<typeof tenantGuardConfigSchema>;
export type GateConfig = NonNullable<TenantGuardConfig["gates"]>[string];
export type SuppressionConfig = NonNullable<GateConfig["suppressions"]>[number];
export type Severity = z.infer<typeof severitySchema>;

export interface ConfigValidationResult {
  ok: boolean;
  config?: TenantGuardConfig;
  errors: string[];
}

export interface LoadedConfig {
  path: string | null;
  config: TenantGuardConfig;
}

export class ConfigError extends Error {}
export class ConfigValidationError extends ConfigError {
  constructor(public readonly errors: string[]) {
    super(`tenantguard config failed validation: ${errors.join("; ")}`);
    this.name = "ConfigValidationError";
  }
}
export class ConfigSecretError extends ConfigError {
  constructor(public readonly path: string) {
    super(`secret-like content detected in ${path} (value not captured)`);
    this.name = "ConfigSecretError";
  }
}
export class ConfigNotFoundError extends ConfigError {
  constructor(public readonly path: string) {
    super(`tenantguard config not found: ${path}`);
    this.name = "ConfigNotFoundError";
  }
}

const DEFAULT_CONFIG: TenantGuardConfig = { version: CONFIG_VERSION };

const SECRET_PATTERNS: RegExp[] = [
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN[ A-Z]*PRIVATE KEY-----/,
  /["']?(secret|password|token|api[_-]?key)["']?\s*[:=]\s*["']?[A-Za-z0-9/+_-]{16,}/i,
];

export function validateConfig(input: unknown): ConfigValidationResult {
  const result = tenantGuardConfigSchema.safeParse(input);
  if (result.success) return { ok: true, config: result.data, errors: [] };
  return {
    ok: false,
    errors: result.error.issues.map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    }),
  };
}

export function findConfigPath(repoRoot: string, explicitPath?: string): string | null {
  if (explicitPath) {
    const candidate = isAbsolute(explicitPath) ? explicitPath : resolve(repoRoot, explicitPath);
    return existsSync(candidate) ? candidate : null;
  }

  for (const name of CONFIG_FILENAMES) {
    const candidate = resolve(repoRoot, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadConfig(repoRoot: string, opts: { configPath?: string } = {}): LoadedConfig {
  const path = findConfigPath(repoRoot, opts.configPath);
  if (!path && opts.configPath) throw new ConfigNotFoundError(opts.configPath);
  if (!path) return { path: null, config: DEFAULT_CONFIG };

  const raw = readFileSync(path, "utf8");
  if (SECRET_PATTERNS.some((pattern) => pattern.test(raw))) {
    throw new ConfigSecretError(path);
  }

  const parsed = path.endsWith(".yaml") || path.endsWith(".yml") ? parseYaml(raw) : JSON.parse(raw);
  const result = validateConfig(parsed);
  if (!result.ok || !result.config) throw new ConfigValidationError(result.errors);
  return { path, config: result.config };
}
