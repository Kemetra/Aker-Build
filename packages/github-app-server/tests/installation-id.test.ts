import { describe, it, expect } from "vitest";
import { readInstallationId } from "../src/http-server.js";

// Single-tenant: the sole installation id is a newly-required, secret-adjacent env var. It gets the
// same fail-fast-without-leaking contract as the other credentials (FR-007). A SENTINEL value lets
// us prove the value is never echoed into the error.
const SENTINEL = "9000000000000001"; // an invalid-but-distinctive value to scan for

describe("readInstallationId — fail-fast guard for TENANTGUARD_INSTALLATION_ID (FR-007)", () => {
  it("returns the integer id when present and valid", () => {
    expect(readInstallationId({ TENANTGUARD_INSTALLATION_ID: "42" })).toBe(42);
  });

  it("throws naming the variable when missing — and never prints a value", () => {
    let message = "";
    try {
      readInstallationId({});
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("TENANTGUARD_INSTALLATION_ID");
  });

  it("throws on an empty value", () => {
    expect(() => readInstallationId({ TENANTGUARD_INSTALLATION_ID: "" })).toThrow(/TENANTGUARD_INSTALLATION_ID/);
  });

  it("throws on a non-integer value, never echoing the offending value", () => {
    let message = "";
    try {
      readInstallationId({ TENANTGUARD_INSTALLATION_ID: `not-a-number-${SENTINEL}` });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain("TENANTGUARD_INSTALLATION_ID");
    expect(message).not.toContain(SENTINEL); // the bad value is never surfaced
  });

  it("throws on a non-positive id (0 and negative are invalid)", () => {
    expect(() => readInstallationId({ TENANTGUARD_INSTALLATION_ID: "0" })).toThrow(/TENANTGUARD_INSTALLATION_ID/);
    expect(() => readInstallationId({ TENANTGUARD_INSTALLATION_ID: "-5" })).toThrow(/TENANTGUARD_INSTALLATION_ID/);
  });
});
