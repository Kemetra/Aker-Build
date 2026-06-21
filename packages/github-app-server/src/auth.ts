import { createAppAuth } from "@octokit/auth-app";
import type { AppCredentials } from "./config.js";

/**
 * Mint ONE short-lived installation token. Injectable so tests never touch the network and can prove
 * the private key never leaks. The real implementation (`octokitMinter`) exchanges an App-JWT for an
 * installation access token via `@octokit/auth-app` — which handles RS256 signing, clock skew, and
 * base64url correctly, the parts that are dangerous to hand-roll (advisor).
 */
export type TokenMinter = (args: {
  appId: string;
  privateKey: string;
  installationId: number;
}) => Promise<string>;

export interface AuthTokenDeps {
  creds: AppCredentials;
  /** Single-tenant: the sole installation id, captured once at wiring time. */
  installationId: number;
  /** Defaults to the octokit-backed minter; injected as a fake in tests. */
  mint?: TokenMinter;
}

/** Raised when minting fails — its message NEVER contains the private key or token (FR-006). */
export class AuthError extends Error {
  constructor() {
    super("failed to mint a GitHub installation token");
    this.name = "AuthError";
  }
}

/**
 * Build the zero-arg `authToken` closure the workspace expects (`() => Promise<string>`). The
 * installation id and credentials are captured here; the per-call token is returned for transient
 * use and never persisted. On any minting failure we throw a redacted `AuthError` — we deliberately
 * do NOT chain the original error (no `cause`), because a minter error message could embed the PEM
 * (Principle VII: the key authenticates, it is never surfaced).
 */
export function makeAuthToken(deps: AuthTokenDeps): () => Promise<string> {
  const mint = deps.mint ?? octokitMinter;
  return async () => {
    try {
      return await mint({
        appId: deps.creds.appId,
        privateKey: deps.creds.privateKey,
        installationId: deps.installationId,
      });
    } catch {
      // Swallow the original (it may carry credential material); throw a clean, secret-free error.
      throw new AuthError();
    }
  };
}

/** Real minter: App-JWT → installation token via @octokit/auth-app. */
const octokitMinter: TokenMinter = async ({ appId, privateKey, installationId }) => {
  const auth = createAppAuth({ appId, privateKey });
  const { token } = await auth({ type: "installation", installationId });
  return token;
};
