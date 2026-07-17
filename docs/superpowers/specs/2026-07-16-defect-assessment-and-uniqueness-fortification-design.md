# Aker Build — Defect Assessment & Uniqueness Fortification

Status: Design, pending review
Date: 2026-07-16
Scope: What is defective or too thin today, and what to fortify/add so Aker Build
launches as a unique, professional product. This refines (does not replace) the
locked fortify-then-expand roadmap (`docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md`).

## The uniqueness thesis

Aker Build's differentiator is a single compound claim no competitor makes:

> Deterministic, evidence-pinned findings (not LLM opinions), calibrated by
> confidence tier, **proven** by a published benchmark scorecard, feeding a safe
> AI-agent build loop (queue → route → prompt → review) that never touches code.

- vs Semgrep/CodeQL: generic SAST; no agent loop, no queue/prompt compiler, no
  tenant-isolation focus, no published per-tier precision claim.
- vs CodeRabbit/Greptile: LLM review opinions; non-deterministic, unprovable.
- vs SaaS boilerplates: they ship code; Aker Build ships *control*.

Every leg of that claim exists in the repo today — and every leg is currently
too thin to carry the claim publicly. That is the defect pattern.

## Defect assessment (evidence-grounded)

| # | Defect | Evidence | Severity |
|---|---|---|---|
| D1 | **Not installable.** No npm package; CLI runs via `pnpm dlx tsx packages/cli/src/bin.ts`. A product you cannot `npx` is a prototype to outsiders. | `README.md` ("npm-published binary is a follow-up"), root `package.json` `private: true`, ADR-010 decided but unexecuted | Critical (professionalism) |
| D2 | **The "prove it" claim is unproven.** Benchmark corpus has 2 cases (`unprotected-admin-route`, `clean-guarded`) covering 1 of the 5 promised failure patterns; `thresholds.json` covers only TG-G4/confirmed. No scorecard is published anywhere user-visible. | `benchmark/cases/` (2 dirs), `benchmark/thresholds.json` (1 gate) vs roadmap P3 promising missing-tenant-filter, destructive-migration, non-idempotent-webhook, leaked-secret cases | Critical (uniqueness) |
| D3 | **Flagship detector has a structural false-positive.** `data-access.ts` requires the tenant token on the *same line* as the query; multi-line ORM style (Prisma `where: { tenantId }` on the next line) is misclassified `no_tenant_filter`. Same-line myopia also affects G4 route/guard matching. | `packages/scanner/src/detect/data-access.ts:15,37`; `packages/gates/src/gates/g4-security.ts:34-43` | High |
| D4 | **Framework coverage is Express-shaped.** `SOURCE_EXT` admits py/go/rb but query/route/guard regexes are JS-ORM/Express idioms; Next.js route handlers, NestJS decorators, Django/SQLAlchemy, Go handlers are invisible. Silent non-coverage reads as "Aker Build found nothing" = false confidence. | `data-access.ts:5-12`, `g4-security.ts:7-14` | High |
| D5 | **P4 renderer merged but unwired.** `renderChecksPayload` exists; the dogfood workflow still publishes only a run-summary markdown — no Checks run, no inline `file:line` annotations on PRs. The evidence-span payoff is unrealized. | `packages/review/src/checks.ts` vs `.github/workflows/aker-build.yml:47-54` | Medium |
| D6 | **013 in limbo.** Config path-scope enforcement sits in draft PR #25, unreviewed for coherence with P2's `min_tier` config. Two config semantics risk shipping half-merged. | Branch `013-config-path-scope-enforcement`, PR #25 (draft), memory note | Medium |
| D7 | **Docs drift.** `CLAUDE.md` still points at 012 as the active feature; P1–P4 merged since. `README` has no scorecard, no positioning against alternatives, no badge. | `CLAUDE.md` (active plan pointer), `README.md` | Low |
| D8 | **Windows-only smoke script.** `scripts/smoke-first-run.ps1` is the documented first-run path; Linux/macOS users (most of the target audience) get no one-liner. | `README.md` quickstart | Low |

## Approaches considered

- **A) Ship-first.** Publish npm + Action now; deepen later. Fastest reach, but
  launches the "provable" positioning with a 2-case benchmark and a known FP in
  the headline detector — the exact "cries wolf → muted" failure the roadmap warns about.
- **B) Proof-first, then ship (RECOMMENDED).** Close the credibility defects
  (D2, D3, D4, D5, D6) in a short fortify pass, then execute distribution (D1,
  D7, D8) as the launch slice. Matches the locked fortify-first dependency chain;
  launch day comes with a real scorecard as the marketing artifact.
- **C) Moat-first.** Build the agent-native surface (MCP server / Claude Code
  skill exposing route/prompt/review). Most unique, but premature: reach without
  proof repeats A's risk with extra scope.

Decision: **B**, with C's smallest slice (MCP/skill wrapper) queued immediately
after launch as the uniqueness amplifier.

## Design — five workstreams, in order

### W1 — Unblock 013 (config coherence) [gate for everything else]
Review PR #25 against P2's config: one config file, one schema; path-scope and
`min_tier` must compose (e.g. per-path tier floors), not compete. Outcome: merge,
amend, or explicitly park with a recorded decision. No new code beyond reconciliation.

### W2 — Prove it for real (fatten P3)
- Grow `benchmark/cases/` from 2 to **≥12 cases**: the 5 promised failure
  patterns × (positive + clean variant) + 2 hard negatives (middleware-guarded
  route; multi-line tenant-scoped Prisma query — which also pins D3's fix).
- Extend `thresholds.json` to every evidence-fed gate (G2, G3, G4, G5) at the
  `confirmed` tier.
- Emit the scorecard into `README.md` (table + generated badge) so the provable
  claim is user-visible. Synthetic cases only (constitution rule).
- Testing: the eval harness itself is the test; dogfood CI runs it and enforces thresholds.

### W3 — Deepen detection honestly (fix D3/D4 without pretending to parse)
- **Multi-line evidence window**: extend tenant-token / guard-token search to a
  bounded statement window (e.g. the query call's balanced-paren span or ±5
  lines) instead of one line. Keep the read-only, evidence-only principle —
  when the window is used, the emitted `confidence` drops to `medium` unless the
  token is same-line (`high`). Honesty is preserved: weaker signal, weaker tier.
- **Framework signature packs**: add recognizers for Next.js route handlers
  (`export async function GET`), NestJS (`@Get`, `@UseGuards`), Fastify hooks,
  Django ORM (`objects.filter`), keeping each pack a small data table feeding the
  existing detectors — not new architecture.
- **Coverage honesty field**: scanner records which packs matched the repo
  (`project-map.coverage`), so "no findings" can render as "no findings in
  covered frameworks: express, prisma" — never silent false confidence.
- Testing: each new pattern gets a fixture case in W2's corpus; regression
  thresholds catch precision drops.

### W4 — Wire P4 into the dogfood (realize the renderer)
Add a step to `.github/workflows/aker-build.yml` that posts the
`renderChecksPayload` output as a real Checks run (needs `checks: write`),
report-only semantics unchanged (`neutral` conclusions; only CLI errors fail).
Inline `file:line` annotations become the visible demo of evidence spans.

### W5 — Ship professional (distribution + polish)
- Execute ADR-010: publish `aker-build` to npm (bin wired, `files` whitelist,
  provenance), so quickstart becomes `npx aker-build scan`.
- Composite GitHub Action (`uses: kemetra/aker-build-action@v1`, or an
  `action.yml` inside this repo per ADR-007) wrapping the
  same chain — the dogfood workflow becomes its first consumer.
- Docs: fix CLAUDE.md active-plan pointer; README gets scorecard, comparison
  positioning ("vs SAST / vs LLM review"), cross-platform smoke script
  (bash twin of the ps1).

### W6 (post-launch, uniqueness amplifier) — Agent-native surface
Smallest slice of approach C: package `route` + `prompt` + `review-pr` as an MCP
server / Claude Code skill so agents *consume* Aker Build's control plane
directly (agent asks "what's my next safest task + prompt?"). Report-only wall
holds: Aker Build still never executes agents. This is the surface no SAST or
LLM-review competitor can copy without rebuilding the whole kernel. Own spec cycle.

## Error handling & principles (all workstreams)
- Detectors stay read-only, evidence-emitting, judgment-free; confidence tiers
  encode uncertainty instead of hiding it.
- No secrets in outputs; no source stored anywhere hosted.
- Every workstream ships through the spec → plan → tasks boundary; W1 is review-only.
- Failure honesty: unreadable files, unmatched frameworks, and threshold misses
  are reported, never swallowed.

## Success criteria
1. Benchmark: ≥12 cases, thresholds on the 3 risk-emitting evidence-fed gates
   (G3/G4/G5; G2 emits only needs_verification in v0 — it joins when 007 diff
   evidence lands), scorecard visible in README.
2. The multi-line Prisma tenant-filter case passes (D3 dead).
3. Dogfood PRs show inline Checks annotations (D5 dead).
4. `npx aker-build scan` works from a clean machine (D1 dead).
5. PR #25 resolved with a recorded decision (D6 dead).

## Out of scope (unchanged non-goals)
Hosted dashboard (P5), enforcement (P6), agent execution, auto-fix/commit/merge,
AST-parser rewrite (signature packs only), Retail Tower / ERPNext logic.
