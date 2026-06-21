import { describe, it, expect } from "vitest";
import { makeAuthToken, type TokenMinter } from "../src/auth.js";

// A realistic-looking PEM sentinel. If this string EVER appears in a returned value or a thrown
// error, secret-safety (Principle VII / FR-006) is violated.
const PRIVATE_KEY = "-----BEGIN RSA PRIVATE KEY-----\nSENTINEL-PEM-DO-NOT-LEAK\n-----END RSA PRIVATE KEY-----";
const APP_ID = "123456";
const INSTALLATION_ID = 99;

const creds = { appId: APP_ID, privateKey: PRIVATE_KEY, webhookSecret: "unused-here" };

describe("makeAuthToken — installation token mint (US1/US2)", () => {
  it("returns a zero-arg closure that mints an installation token", async () => {
    const minter: TokenMinter = async () => "ghs_installation_token_value";
    const authToken = makeAuthToken({ creds, installationId: INSTALLATION_ID, mint: minter });

    const token = await authToken();

    expect(token).toBe("ghs_installation_token_value");
  });

  it("passes the captured installation id and app creds to the minter", async () => {
    let seen: { appId: string; privateKey: string; installationId: number } | undefined;
    const minter: TokenMinter = async (args) => {
      seen = args;
      return "ghs_x";
    };
    const authToken = makeAuthToken({ creds, installationId: INSTALLATION_ID, mint: minter });

    await authToken();

    expect(seen).toEqual({ appId: APP_ID, privateKey: PRIVATE_KEY, installationId: INSTALLATION_ID });
  });

  it("NEVER includes the private key in the returned token (FR-006)", async () => {
    const minter: TokenMinter = async () => "ghs_clean_token";
    const authToken = makeAuthToken({ creds, installationId: INSTALLATION_ID, mint: minter });

    const token = await authToken();

    expect(token).not.toContain("SENTINEL-PEM");
    expect(token).not.toContain("BEGIN RSA PRIVATE KEY");
  });

  it("NEVER leaks the private key when minting fails (FR-006) — re-throws a redacted error", async () => {
    // The real minter could throw an error whose message embeds the PEM. The adapter MUST NOT
    // propagate that material. We simulate a minter that throws with the key in its message.
    const leakyMinter: TokenMinter = async () => {
      throw new Error(`auth failed for key ${PRIVATE_KEY}`);
    };
    const authToken = makeAuthToken({ creds, installationId: INSTALLATION_ID, mint: leakyMinter });

    await expect(authToken()).rejects.toThrow();
    try {
      await authToken();
    } catch (err) {
      const serialized = `${(err as Error).name}: ${(err as Error).message}\n${(err as Error).stack ?? ""}`;
      expect(serialized).not.toContain("SENTINEL-PEM");
      expect(serialized).not.toContain("BEGIN RSA PRIVATE KEY");
    }
  });
});
