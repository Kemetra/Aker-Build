import { describe, it, expect } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { scanToFile } from "@tenantguard/scanner";
import { runGates, validateRisks } from "../src/index.js";

// ADR-012 follow-up #1: prove `paths.exclude` (013) and `gates.*.min_tier` (P2) compose in one
// config, in a single gate run. Same admin-route content lives at an excluded path and a kept
// path; the file itself is crafted so TG-G4 emits BOTH a confirmed and a suspected finding on the
// SAME file (see ADMIN_CONTENT below), so all three assertions land on `kept/admin.ts`.

// `isAdmin` satisfies g4-security's ROLE_GUARD token but not its AUTH_GUARD token, and it sits off
// the route line — so:
//   - auth-guard arm: no AUTH_GUARD token anywhere in the file -> high confidence -> confirmed.
//   - admin-route arm: a ROLE_GUARD token exists elsewhere in the file (not on the route line)
//     -> medium confidence -> suspected.
const ADMIN_CONTENT = `import { isAdmin } from "./roles";
export function listUsers(req, res) {
  return res.json([]);
}
router.get('/admin/users', listUsers);
`;

function initGitRepo(dir: string): void {
  const git = (...args: string[]): void => {
    execFileSync("git", args, { cwd: dir, stdio: "ignore" });
  };
  git("init", "-q");
  git("config", "user.email", "test@tenantguard.local");
  git("config", "user.name", "TenantGuard Test");
}

/** Build a throwaway repo with excluded/admin.ts + kept/admin.ts (identical content) + config. */
function buildFixture(): { repoRoot: string; outDir: string } {
  const repoRoot = mkdtempSync(join(tmpdir(), "tg-gates-composition-"));
  mkdirSync(join(repoRoot, "excluded"), { recursive: true });
  mkdirSync(join(repoRoot, "kept"), { recursive: true });
  writeFileSync(join(repoRoot, "excluded", "admin.ts"), ADMIN_CONTENT, "utf8");
  writeFileSync(join(repoRoot, "kept", "admin.ts"), ADMIN_CONTENT, "utf8");
  writeFileSync(
    join(repoRoot, "tenantguard.config.json"),
    JSON.stringify(
      {
        version: 1,
        paths: { exclude: ["excluded/**"] },
        gates: { "TG-G4": { min_tier: "confirmed" } },
      },
      null,
      2,
    ),
    "utf8",
  );
  initGitRepo(repoRoot);

  const outDir = join(repoRoot, ".tenantguard");
  scanToFile(repoRoot, outDir); // auto-discovers tenantguard.config.json (already on disk)
  return { repoRoot, outDir };
}

describe("013 x P2: paths.exclude composes with gates.*.min_tier", () => {
  it("excludes findings under excluded/**, suppresses suspected findings on kept/** with audited metadata, and surfaces confirmed findings on kept/** normally", () => {
    const { repoRoot, outDir } = buildFixture();

    const { risks } = runGates(repoRoot, { out: outDir, gates: ["TG-G4"] });
    expect(validateRisks(risks).ok).toBe(true);

    // (1) no finding references excluded/admin.ts in any status.
    const paths = risks.findings.flatMap((f) => f.evidence.map((e) => e.path));
    expect(paths).not.toContain("excluded/admin.ts");

    const keptFindings = risks.findings.filter((f) =>
      f.evidence.some((e) => e.path === "kept/admin.ts"),
    );
    expect(keptFindings.length).toBeGreaterThan(0);

    // (2) suspected-tier findings on kept/admin.ts carry a min_tier suppression record, not a
    // silent drop (P2 contract: audited, never dropped).
    const suspectedSuppressed = keptFindings.filter(
      (f) => f.suppression?.id === "min-tier:TG-G4",
    );
    expect(suspectedSuppressed.length).toBeGreaterThan(0);
    for (const f of suspectedSuppressed) {
      expect(f.suppression?.reason).toContain("min_tier");
    }

    // (3) confirmed-tier findings on kept/admin.ts surface normally (no suppression).
    const confirmedSurfaced = keptFindings.filter((f) => f.suppression === undefined);
    expect(confirmedSurfaced.length).toBeGreaterThan(0);
    for (const f of confirmedSurfaced) {
      expect(f.evidence.some((e) => e.confidence === "high")).toBe(true);
    }
  });
});
