/**
 * Load and validate the App's credentials from the environment ONLY (FR-005). On a missing
 * credential the process MUST fail fast naming the variable — but NEVER printing its value (FR-007).
 * The loaded credentials live only in memory; nothing here writes them anywhere.
 */

export interface AppCredentials {
  appId: string;
  privateKey: string;
  webhookSecret: string;
}

export const REQUIRED_ENV = [
  "AKER_BUILD_APP_ID",
  "AKER_BUILD_APP_PRIVATE_KEY",
  "AKER_BUILD_WEBHOOK_SECRET",
] as const;

export class MissingCredentialError extends Error {
  constructor(public readonly missing: string[]) {
    // Names the missing variables ONLY — never any value (FR-006/FR-007).
    super(`missing required credential environment variable(s): ${missing.join(", ")}`);
    this.name = "MissingCredentialError";
  }
}

/**
 * Read credentials from an env-like record (defaults to `process.env`). Throws
 * `MissingCredentialError` listing every absent/empty variable by NAME — values never appear.
 */
export function loadCredentials(env: Record<string, string | undefined> = process.env): AppCredentials {
  const missing = REQUIRED_ENV.filter((name) => {
    const v = env[name];
    return v === undefined || v.trim() === "";
  });
  if (missing.length > 0) throw new MissingCredentialError([...missing]);

  return {
    appId: env.AKER_BUILD_APP_ID!,
    privateKey: env.AKER_BUILD_APP_PRIVATE_KEY!,
    webhookSecret: env.AKER_BUILD_WEBHOOK_SECRET!,
  };
}
