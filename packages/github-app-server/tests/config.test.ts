import { describe, it, expect } from "vitest";
import { loadCredentials, MissingCredentialError } from "../src/config.js";

const FULL = {
  AKER_BUILD_APP_ID: "123",
  AKER_BUILD_APP_PRIVATE_KEY: "PRIVATE-KEY-SENTINEL",
  AKER_BUILD_WEBHOOK_SECRET: "WEBHOOK-SENTINEL",
};

describe("loadCredentials (FR-005/FR-007)", () => {
  it("loads all credentials from env", () => {
    const c = loadCredentials(FULL);
    expect(c.appId).toBe("123");
    expect(c.privateKey).toBe("PRIVATE-KEY-SENTINEL");
    expect(c.webhookSecret).toBe("WEBHOOK-SENTINEL");
  });

  it.each([
    "AKER_BUILD_APP_ID",
    "AKER_BUILD_APP_PRIVATE_KEY",
    "AKER_BUILD_WEBHOOK_SECRET",
  ])("fails fast naming the missing variable %s", (missing) => {
    const env = { ...FULL, [missing]: undefined };
    expect(() => loadCredentials(env)).toThrow(MissingCredentialError);
    try {
      loadCredentials(env);
    } catch (e) {
      expect((e as Error).message).toContain(missing);
    }
  });

  it("treats empty/whitespace as missing", () => {
    expect(() => loadCredentials({ ...FULL, AKER_BUILD_WEBHOOK_SECRET: "  " })).toThrow(MissingCredentialError);
  });

  it("the missing-credential error NEVER contains a credential value (FR-006/FR-007)", () => {
    // Only one present, two missing — assert the present value is not echoed.
    const env = { AKER_BUILD_APP_PRIVATE_KEY: "PRIVATE-KEY-SENTINEL" };
    try {
      loadCredentials(env);
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as Error).message).not.toContain("PRIVATE-KEY-SENTINEL");
    }
  });
});
