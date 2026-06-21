import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifySignature, parseEvent, WebhookSignatureError } from "../src/webhook.js";

const SECRET = "test-secret";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

function payload(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    action: "opened",
    pull_request: { number: 42, draft: false, head: { sha: "abc123" } },
    repository: { owner: { login: "org" }, name: "repo" },
    installation: { id: 99 },
    ...over,
  });
}

describe("verifySignature (FR boundary integrity, R2)", () => {
  it("accepts a correct signature", () => {
    const body = payload();
    expect(() => verifySignature(body, sign(body), SECRET)).not.toThrow();
  });

  it("rejects a wrong signature", () => {
    const body = payload();
    expect(() => verifySignature(body, "sha256=deadbeef", SECRET)).toThrow(WebhookSignatureError);
  });

  it("rejects a missing signature header", () => {
    const body = payload();
    expect(() => verifySignature(body, undefined, SECRET)).toThrow(WebhookSignatureError);
  });

  it("rejects when the body is tampered after signing", () => {
    const sig = sign(payload());
    const tampered = payload({ action: "synchronize" });
    expect(() => verifySignature(tampered, sig, SECRET)).toThrow(WebhookSignatureError);
  });
});

describe("parseEvent action filter (US1, Contract A)", () => {
  it("normalizes a reviewable opened event", () => {
    const ev = parseEvent(payload());
    expect(ev).not.toBeNull();
    expect(ev).toMatchObject({ owner: "org", repo: "repo", prNumber: 42, headSha: "abc123", isDraft: false });
  });

  it.each(["reopened", "synchronize"])("accepts %s", (action) => {
    expect(parseEvent(payload({ action }))).not.toBeNull();
  });

  it.each(["closed", "labeled", "assigned", "edited"])("drops non-reviewable action %s (null, not error)", (action) => {
    expect(parseEvent(payload({ action }))).toBeNull();
  });

  it("captures draft flag", () => {
    const ev = parseEvent(payload({ pull_request: { number: 7, draft: true, head: { sha: "ff" } } }));
    expect(ev?.isDraft).toBe(true);
  });

  it("throws on a structurally invalid payload (boundary failure)", () => {
    expect(() => parseEvent(JSON.stringify({ action: "opened" }))).toThrow();
  });
});
