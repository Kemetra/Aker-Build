import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { scanToFile } from "@tenantguard/scanner";
import { runGatesToFile } from "@tenantguard/gates";
import { reviewLocalDiff } from "../src/review.js";
import { renderReport } from "../src/render.js";

/**
 * T036 — the ONE genuine end-to-end chain (scan → gates → reviewLocalDiff) over a real fixture repo,
 * using the REAL git + gates sources (no injection). Proves the default-real wiring integrates and
 * that a vulnerable change introduced by the diff produces a Not-Ready verdict naming the gate.
 */
describe("e2e: scan → gates → review-pr --local-diff (T036)", () => {
  it("a diff adding an unguarded admin route → Not Ready, TG-G4 attributed to the changed file", () => {
    const root = join(mkdtempSync(join(tmpdir(), "tg-e2e-")), "sample");
    mkdirSync(join(root, "apps/api/routes"), { recursive: true });
    const git = (...a: string[]) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
    git("init", "-q");
    git("config", "user.email", "t@t.local");
    git("config", "user.name", "T");
    writeFileSync(join(root, "apps/api/routes/health.ts"), "export const ok = 1;\n", "utf8");
    writeFileSync(join(root, "package.json"), '{"name":"sample"}\n', "utf8");
    git("add", ".");
    git("-c", "commit.gpgsign=false", "commit", "-q", "-m", "base");
    // the change under review: an admin route with no role guard (G4 flags it)
    writeFileSync(
      join(root, "apps/api/routes/admin.ts"),
      "app.get('/admin', (req, res) => res.send('hi'));\n",
      "utf8",
    );

    const out = join(root, ".tenantguard");
    scanToFile(root, out); // → project-map.json (real scanner)
    runGatesToFile(root, { out }); // → risks.json (real gates)

    // real git source + real gates (no deps injected) — the default production path
    const report = reviewLocalDiff({ out }, { repoRoot: root });

    expect(report.mode).toBe("local-diff");
    expect(report.changed_files).toContain("apps/api/routes/admin.ts");
    // out-dir artifacts must not pollute the changed files (SC-007)
    expect(report.changed_files.some((f) => f.startsWith(".tenantguard/"))).toBe(false);
    expect(report.verdict).toBe("not_ready");
    expect(report.findings.some((f) => "gate_id" in f && f.gate_id === "TG-G4")).toBe(true);

    // the rendered Markdown matches the documented quickstart shape (gate line + indented evidence)
    const md = renderReport(report);
    expect(md).toMatch(/^# Review: Not Ready/);
    expect(md).toContain("## Contributing findings");
    expect(md).toMatch(/- \*\*TG-G4\*\* \(risk, high\)/);
    expect(md).toMatch(/\n {2}- `apps\/api\/routes\/admin\.ts:\d+` — /); // indented evidence sub-bullet
    expect(md).toContain("## Verdict");
  });
});
