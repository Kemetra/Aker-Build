import { describe, it, expect } from "vitest";
import type { ChecksPayload, ReviewReport } from "@tenantguard/review";
import { buildPayload, postCheck, type ChecksClient } from "../src/checks.js";
import { handleEvent, type HandlerDeps } from "../src/index.js";
import type { PullRequestEvent } from "../src/types.js";

function report(over: Partial<ReviewReport> = {}): ReviewReport {
  return {
    schema_version: 1,
    mode: "pr",
    verdict: "ready",
    changed_files: ["a.ts"],
    findings: [],
    scope: { checked: false, violations: [] },
    github_available: true,
    ...over,
  };
}

/** A confirmed-tier evidence object (confidence:"high" is what makes the finding block — P2). */
function confirmedEvidence(path: string, line: number) {
  return { type: "line" as const, path, line, signal: "tenant-isolation risk", confidence: "high" as const };
}

function confirmedRiskReport(): ReviewReport {
  return report({
    verdict: "not_ready",
    findings: [
      { gate_id: "TG-G4", status: "risk", severity: "critical", evidence: [confirmedEvidence("apps/api/admin.ts", 12)] },
    ],
  });
}

/** A synthetic gates result with one confirmed TG-G4 risk at the given path/line. */
function confirmedGatesResult(path: string, line: number) {
  return {
    risks: {
      schema_version: 1,
      findings: [
        { gate_id: "TG-G4", status: "risk" as const, severity: "critical" as const, evidence: [confirmedEvidence(path, line)] },
      ],
    },
  };
}

const EVENT: PullRequestEvent = {
  owner: "org",
  repo: "repo",
  prNumber: 42,
  headSha: "abc123",
  isDraft: false,
  installationId: 99,
};

/** Fake client that records every write and lets us assert nothing forbidden happened. */
function fakeClient(opts: { existing?: number | null } = {}): ChecksClient & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    async createCheck() {
      calls.push("checks.create");
      return { id: 1 };
    },
    async updateCheck() {
      calls.push("checks.update");
    },
    async findCheck() {
      return opts.existing != null ? { id: opts.existing } : null;
    },
  };
}

const baseDeps = (client: ChecksClient): HandlerDeps => ({
  checksClient: client,
  workspace: {
    async checkout() {
      return "/tmp/ephemeral";
    },
    async dispose() {},
  },
  prChangedFiles: () => ["apps/api/admin.ts"],
  prMetadata: () => ({ title: "t", state: "open", baseRefName: "main" }),
});

describe("buildPayload (US1/US2 — reuse renderer + draft override)", () => {
  it("a confirmed risk yields a failure conclusion with an annotation at the right file:line", () => {
    const p = buildPayload(confirmedRiskReport(), { isDraft: false });
    expect(p.conclusion).toBe("failure");
    const a = p.annotations.find((x) => x.path === "apps/api/admin.ts");
    expect(a?.start_line).toBe(12);
  });

  it("a clean report yields success", () => {
    expect(buildPayload(report(), { isDraft: false }).conclusion).toBe("success");
  });

  it("draft PR overrides a failure to neutral (FR-015)", () => {
    const p = buildPayload(confirmedRiskReport(), { isDraft: true });
    expect(p.conclusion).toBe("neutral");
  });

  it("draft override never upgrades a passing result (success stays success)", () => {
    expect(buildPayload(report(), { isDraft: true }).conclusion).toBe("success");
  });

  it("annotations never exceed 50 (FR-006/SC-005)", () => {
    const many = report({
      verdict: "not_ready",
      findings: Array.from({ length: 80 }, (_, i) => ({
        gate_id: "TG-G4",
        status: "risk" as const,
        severity: "high" as const,
        evidence: [confirmedEvidence(`f${i}.ts`, i + 1)],
      })),
    });
    const p = buildPayload(many, { isDraft: false });
    expect(p.annotations.length).toBeLessThanOrEqual(50);
    expect(p.summary).toContain("more annotation");
  });
});

describe("postCheck (FR-012 idempotency, FR-007 allowlist)", () => {
  const payload: ChecksPayload = { name: "TenantGuard", conclusion: "success", title: "Ready", summary: "", annotations: [] };

  it("creates a check when none exists", async () => {
    const c = fakeClient({ existing: null });
    await postCheck(c, EVENT, payload);
    expect(c.calls).toEqual(["checks.create"]);
  });

  it("updates (not duplicates) when a check already exists for the head", async () => {
    const c = fakeClient({ existing: 7 });
    const id = await postCheck(c, EVENT, payload);
    expect(c.calls).toEqual(["checks.update"]);
    expect(id).toBe(7);
  });

  it("only ever performs checks writes — never a forbidden one", async () => {
    const c = fakeClient({ existing: null });
    await postCheck(c, EVENT, payload);
    expect(c.calls.every((op) => op === "checks.create" || op === "checks.update")).toBe(true);
  });
});

describe("handleEvent end-to-end (US1/US3)", () => {
  it("opened PR with a confirmed risk → failing check, annotation at correct file:line, disposes workspace (SC-002)", async () => {
    // Drive the REAL run → reviewPr → diff-attribution → buildPayload seam with a genuine confirmed
    // TG-G4 finding (a synthetic gates result, so no live git checkout is needed). The finding only
    // surfaces because its evidence path is in the changed-files set (real attribution logic).
    const c = fakeClient();
    let disposed = false;
    const deps = baseDeps(c);
    deps.workspace.dispose = async () => {
      disposed = true;
    };
    deps.prChangedFiles = () => ["apps/api/admin.ts"];
    deps.runGates = () => confirmedGatesResult("apps/api/admin.ts", 8);

    const { payload, checkId } = await handleEvent(EVENT, deps);

    expect(checkId).toBe(1);
    expect(c.calls).toEqual(["checks.create"]);
    expect(disposed).toBe(true);
    expect(payload.conclusion).toBe("failure"); // genuine US1/SC-002 assertion
    const a = payload.annotations.find((x) => x.path === "apps/api/admin.ts");
    expect(a).toBeDefined();
    expect(a?.start_line).toBe(8);
  });

  it("the same confirmed risk on a DRAFT PR → neutral, still annotated (FR-015 end-to-end)", async () => {
    const c = fakeClient();
    const deps = baseDeps(c);
    deps.prChangedFiles = () => ["apps/api/admin.ts"];
    deps.runGates = () => confirmedGatesResult("apps/api/admin.ts", 8);
    const { payload } = await handleEvent({ ...EVENT, isDraft: true }, deps);
    expect(payload.conclusion).toBe("neutral");
    expect(payload.annotations.some((x) => x.path === "apps/api/admin.ts")).toBe(true);
  });

  it("review that cannot complete → neutral, never success (FR-011)", async () => {
    const c = fakeClient();
    const deps = baseDeps(c);
    deps.workspace.checkout = async () => {
      throw new Error("checkout timed out");
    };
    const { payload } = await handleEvent(EVENT, deps);
    expect(payload.conclusion).toBe("neutral");
    expect(payload.title).toMatch(/could not complete/i);
  });

  it("disposes the ephemeral workspace even when the review throws (no stored source, FR-008)", async () => {
    const c = fakeClient();
    const deps = baseDeps(c);
    let disposed = false;
    deps.workspace.dispose = async () => {
      disposed = true;
    };
    deps.prMetadata = () => {
      throw new Error("boom");
    };
    await handleEvent(EVENT, deps);
    expect(disposed).toBe(true);
  });
});
