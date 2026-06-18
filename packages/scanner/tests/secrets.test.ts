import { describe, it, expect } from "vitest";
import { scan } from "../src/index.js";
import { fixture } from "./helpers.js";

const SECRET = "AKIAIOSFODNN7EXAMPLEDEADBEEFCAFE1234567890";

describe("T024 secret safety (SC-006, FR-012)", () => {
  it("flags secret-like content as a note, never copying the value", () => {
    const { map, notes } = scan(fixture("withsecret"));
    const flagged = notes.find((n) => n.kind === "flagged_secret");
    expect(flagged).toBeDefined();
    expect(flagged?.path).toContain(".env");
    // The secret value must never appear anywhere in the output.
    const serialized = JSON.stringify({ map, notes });
    expect(serialized).not.toContain(SECRET);
  });
});
