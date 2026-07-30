# Aker Build — Uniqueness Repositioning (Depth → Adoption → Differentiation)

Status: Design, pending review
Date: 2026-07-30
Scope: What to change so Aker Build is defensibly unique, given a competitive
landscape where three of its five claimed differentiators are now commodity.
Supersedes the *positioning* half of
`docs/superpowers/specs/2026-07-16-defect-assessment-and-uniqueness-fortification-design.md`
(that document's defect list D1–D5 is largely closed in code; see "Doc drift").
Does not alter the locked identity decision in
`docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md`: Aker Build stays
the control plane, not an actor.

## Provenance of this design

Two inputs, both recorded here so a reader can weigh them:

1. **Repo verification** (this session): benchmark corpus, detectors, thresholds,
   and npm registry state were read directly rather than taken from docs.
2. **Competitive research** (this session, web + GitHub): findings below are
   attributed with URLs. Items the researcher flagged as unverified are marked.

Owner decision recorded: sequence **Depth → Adoption → Differentiation**, three
separate spec/plan/tasks cycles with review at each boundary.

The repositioning in "The claim shift" was presented to the owner and is carried
here as the working assumption. It is **not yet owner-approved** and is the first
thing the review of this document should accept or reject, because Stages A–C all
assume it.

## Verified starting state (2026-07-30)

| Fact | Evidence | Implication |
|---|---|---|
| `aker-build` is **not on npm** | `npm view aker-build` → E404 | No external user can install. Every uniqueness claim is unobservable from outside. |
| Benchmark corpus is **15 cases**, not 2 | `benchmark/cases/` | The 2026-07-16 spec's D2 ("Critical: 2 cases") is stale. |
| **8 detectors** exist | `packages/scanner/src/detect/` (auth, config-surface, data-access, migrations, repos, routes, secrets, stack) | P1 deepen-detection is done. |
| Thresholds cover **G3/G4/G5** | `benchmark/thresholds.json` | P3 regression gating is wired. |
| Scorecard reads **100% precision AND 100% recall on all five rows** | `README.md` | See "The proof problem" — this is a defect, not an achievement. |
| README **already admits** two uncovered failure modes | `README.md` "Known limitations" | Admitted but unbenchmarked; one is a false negative in the flagship gate. |

The 2026-07-16 fortification design is therefore **stale in its defect list** but
**still correct in its structure**. This document replaces its uniqueness thesis.

## Competitive reality — claims that must be retired

The prior thesis was a five-legged compound claim: deterministic + evidence-pinned
+ calibrated + proven + agent loop. Research shows three legs are commodity.

A compound claim is itself a warning sign: "each part is weak but the combination
is unique" is the argument every undifferentiated product makes. The remedy is not
a better combination; it is to lead with the one leg nobody else occupies.

### Retire: "multi-tenant isolation detection is unique"

[`pgrls`](https://github.com/pgrls/pgrls) (MIT, 67 lint rules, 514 commits) does
exactly this and does it harder: static analysis of raw DDL with no database
required, **Z3 SMT solver proofs**, semantic diff emitting concrete leaking row
values (e.g. `{tenant_id=2}`), SARIF output, GitHub Code Scanning annotations,
`--fail-on` CI gating, `--baseline` for new-violations-only, and 20 mechanically
auto-fixable rules.

Regex plus a `file:line` span cannot out-prove an SMT proof. Do not try.

Adjacent territory is also mature: tenant isolation is a subset of **BOLA**
(OWASP API Security #1). `BolaZ` uses CodeQL taint tracking to trace resource-ID
dataflow ([arxiv 2507.02309](https://arxiv.org/pdf/2507.02309)); an empirical
taxonomy from 100+ bug-bounty disclosures names "Tenant Isolation BOLA" as a
category ([arxiv 2605.25865](https://arxiv.org/pdf/2605.25865)).

**What survives:** pgrls is Postgres/RLS **database-layer** only; the CodeQL BOLA
work is research-grade and Java-centric. Aker Build is TypeScript-first and can
detect missing tenant predicates in **ORM/application-layer query code** (Prisma,
Drizzle, TypeORM) — a layer pgrls cannot see. The claim shrinks from "we detect
multi-tenant failures" to "we detect them in TypeScript application query code,
complementing database-layer linters like pgrls." Narrow, but true, and it makes
pgrls a **complement to cite** rather than a competitor to lose to.

### Retire: "report-only is a differentiator"

Report-only is the category default, not a distinguishing feature. CodeScene,
SonarQube, and Semgrep MCP servers are all read-only advisory.
[Codacy Guardrails](https://www.codacy.com/guardrails) has moved *past* it —
scanning AI-generated code as it is generated and auto-fixing in-IDE.

**Reframe, do not abandon.** Report-only should be sold as **auditability**
(deterministic, reproducible, no mutation risk), never as restraint. The identity
decision stands; only the marketing framing changes.

### Retire: "publishing a precision scorecard is unique"

Table stakes. [Greptile](https://www.greptile.com/benchmarks) publishes real
methodology (5 repos, 10 bug-fix PRs each, bugs traced to introducing commits,
replicated across 5 clean forks, line-level-comment criterion). DeepSource claims
84.51% F1 / 100% precision. Macroscope claims 118 bugs across 45 repos.
(DeepSource and Macroscope numbers are self-reported and unverified.)

**What remains open:** every one of those benchmarks is self-authored,
self-favorable, and has **no downloadable corpus**. Greptile's explicitly
**excludes false positives** from its catch rate — it measures recall, not
precision. So the open claim is narrow and specific: a **reproducible, released,
FP-inclusive** benchmark. That is defensible. "We publish numbers" is not.

### Also note: OpenLore occupies the deterministic-guardrails framing

[OpenLore](https://github.com/clay-good/OpenLore) (234★, 1,468 commits, npm
`openlore`) markets *"deterministic, local-first memory and guardrails for AI
coding agents with no LLM in the hot path"* — nearly Aker Build's exact words.
Its `check_architecture` answers "may a file under A import B?" as a pre-write
verdict from declared `layers`/`forbidden` rules. That occupies TG-G1.

It does **not** do allowed/forbidden-file scoping, task routing, or queue
derivation. That gap is the opening.

### Also note: MCP governance servers are crowded

[CodeScene MCP](https://github.com/codescene-oss/codescene-mcp-server) exposes 24
tools including `analyze_change_set` (branch-level PR review) and
`list_technical_debt_hotspots_for_project` (fix prioritization) — two links in
Aker Build's chain. SonarQube exposes quality gates and issue search. Codacy runs
25+ tools with real-time guardrails.

**The distinction that survives:** CodeScene prioritizes *technical debt to
refactor*. Nobody prioritizes *what an agent should attempt next*.

### Also note: Spec Kit already has gates

Spec Kit's `/analyze` performs cross-artifact consistency analysis, treats the
constitution as non-negotiable, assigns severity where CRITICAL = "violates
constitution MUST", and gates before `/speckit-implement`. Checklists explicitly
act as acceptance gates.

**The distinction that survives:** Spec Kit gates are **LLM-evaluated judgments
about documents**. Aker Build's gates are **deterministic checks against scanned
source**. Real, but subtle to sell — so it must not be the headline.

## Genuinely unoccupied territory

The research searched specifically for competitors on these and found none.

### 1. Queue derivation + safest-next-task routing

Deriving an ordered task queue from a scanned architecture map and risk model,
then routing by **agent-safety**. Searches surfaced only model routing (which LLM
for which task), generic Redis-backed agent task queues (`block/agent-task-queue`
— prevents concurrent agents thrashing a machine, unrelated), and blog-level
context advice. CodeScene's hotspot ranking is nearest, but ranks debt-to-refactor,
not agent-attemptability.

This is the least occupied link in the chain — and the one the current README
underweights relative to the detectors.

### 2. Deriving agent scope rather than declaring it

[`logi-cmd/agent-guardrails`](https://github.com/logi-cmd/agent-guardrails)
requires the **user** to declare intended files and allowed paths. OpenLore
requires a hand-written `architecture.json`. Aker Build computes allowed/forbidden
files from `scan → project-map`.

**Critical reframe.** Putting allowed-files *in a prompt* is strictly weaker than
platform enforcement: Claude Code `settings.json` supports deny/ask/allow glob
rules evaluated deny-first
([docs](https://platform.claude.com/docs/en/agent-sdk/permissions)); GitHub
Copilot's coding agent can only push to `copilot/*` branches. A prompt is advisory
text a model may ignore; a deny rule is mechanical.

So Aker Build must claim the **derivation**, not the enforcement — and the natural
follow-on is to **emit** a `settings.json` deny-block, letting the platform
enforce what Aker Build computed. Small feature, outsized positioning value: it
converts a weakness (advisory prompts) into a handoff (we compute, the platform
enforces).

## The claim shift

**From** (leads with detectors — the crowded part):

> Deterministic, evidence-pinned findings, calibrated by confidence tier, proven
> by a published benchmark, feeding a safe AI-agent build loop.

**To** (leads with the queue — the open part):

> Aker Build tells your coding agent what to work on next, and what it's allowed
> to touch — derived from a scan of your architecture, not hand-declared.

Detectors become **supporting evidence for the routing decision** rather than the
headline. This is the load-bearing change; Stages A–C assume it.

## The proof problem (why Depth comes first)

The scorecard reads 100% precision **and** 100% recall on all five gate×tier rows,
over 15 cases authored in-house. To a skeptical reviewer that does not read as
proof; it reads as a corpus that is not hard enough. Two consequences:

1. **The thresholds are decorative.** Floors sit at 0.9 precision / 0.85 recall
   while actuals are 1.0. Nothing can trip them, so the regression gate that is
   supposed to protect quality currently protects nothing.
2. **The admitted failure modes are unbenchmarked.** The README names them: the
   ±5-line statement window can classify an **unscoped** query as **scoped**, and
   receiver-gating misses model-first ORM calls (`User.findOne(`). The first is a
   **false negative in the tenant-isolation gate** — the worst failure class for
   this product. Documented, but not measured.

Amplifying reach (npm, MCP, Action) before this is addressed means scaling an
unproven precision claim to a wider audience — the "cries wolf → muted" failure
the roadmap warns about, running in reverse (silence, not noise).

## Design — three stages

Each stage is its own spec → plan → tasks cycle with owner review at the boundary.
No stage begins before the prior one's exit criteria are met.

### Stage A — Depth: make the scorecard honest

**Goal.** A scorecard a skeptic believes. Success is the number going **down**.

- Add adversarial benchmark cases targeting the README-admitted limitations:
  - `window-bleed-false-negative` — an unscoped query whose neighbouring statement
    places a tenant token inside the ±5-line window. Pins the FN.
  - `model-first-orm` — Mongoose-style `User.findOne(` receiver the detector does
    not gate on. Pins the receiver-gating miss.
  - Hard negatives for each remaining detector family (auth, migrations,
    config-surface, routes, secrets), so every detector has at least one case it
    is expected to stay silent on.
- **Do not touch `benchmark/thresholds.json`.** Let the existing floors adjudicate.
  The arithmetic is the point: floors sit at 0.90 precision / 0.85 recall while
  actuals are 1.00, so adding a false-negative case moves recall *down toward* a
  floor that is already correctly placed. If it lands at 0.92, the floor is now
  live and meaningful with no edit. If it trips CI, that is the gate doing its
  job — the response is to fix the detector, or to lower the floor as a **recorded
  decision with a written reason and the uncovered pattern documented**. A silent
  recalibration to restore green is the single move that would destroy the
  credibility this stage exists to build, and is forbidden here.
- Ship the **coverage-honesty field** (`project-map.coverage`) so "no findings"
  renders as "no findings in covered frameworks: express, prisma" — never silent
  false confidence. This is the W3b field the prior design specified and is a
  precondition for Stage B's real-repo runs being interpretable.
- Rewrite the README scorecard section to lead with limitations, not perfection.

**Exit criteria.** Scorecard published with at least one sub-1.0 figure; every
README-admitted limitation has a corpus case; `thresholds.json` either unchanged
or changed with a recorded decision; `coverage` field emitted and rendered.

**Testing.** The eval harness is the test. Dogfood CI enforces thresholds.

**Risk.** The scorecard drops enough to look weak. Mitigation: publish the
uncovered-pattern list alongside it — a bounded, honest claim outperforms an
unbelievable one, and it is the *reproducible, FP-inclusive* benchmark that the
competitive research identified as the one open claim in this area.

### Stage B — Adoption: make it installable and externally evidenced

**Goal.** A stranger runs `npx aker-build scan` and succeeds.

- **npm publish.** Owner action — the release workflow is approval-protected by
  design. Everything up to the `npm publish` invocation is prepared and verified;
  the publish itself is not automated by this work.
- **Real-repo evidence.** Run the full chain against 3–5 real OSS multi-tenant
  TypeScript repos. Publish what it found, **what it missed**, and the coverage
  output. No competitor publishes their misses; combined with Stage A's honest
  scorecard this is the differentiating artifact.

  **Known gap — resolve before planning Stage B.** There is no ground truth for a
  real repo (no `expected.json` for Cal.com), so "what it missed" has no mechanism
  behind it as written. Three candidate resolutions, to be chosen at Stage B
  review: (a) manual audit of a bounded sample of query sites; (b) **cross-tool
  differential** — run pgrls and/or Semgrep over the same repos and publish the
  delta, which doubles as citing complements rather than claiming to subsume them;
  (c) narrow the claim from "misses" to "coverage", which is exactly what
  `project-map.coverage` yields. This does not block Stage A. See open question 4.
- **Doc drift repair.** The 2026-07-16 spec lists D2 as Critical though the code
  closed it; `CLAUDE.md`'s active-feature pointer needs updating; README needs the
  Stage-A positioning. A cold reader currently forms a worse impression than the
  code deserves.
- **Cross-platform quickstart.** `scripts/smoke-first-run.ps1` is Windows-only;
  most of the target audience is not. Ship a bash twin.

**Exit criteria.** `npm view aker-build version` resolves; a clean-machine
`npx aker-build scan` succeeds on Linux/macOS/Windows; real-repo report published;
no stale active-feature pointer or contradicted defect list in docs.

**Dependency.** Requires Stage A. Publishing first would ship the 100%/100% claim.

### Stage C — Differentiation: the agent-native moat

**Goal.** Agents consume the control plane directly.

**The moat is the contents, not the surface.** CodeScene's MCP server already
exposes PR-delta review and fix prioritization, so "we ship an MCP server" is not
a pitch — it is a transport. What is unoccupied is *what travels over it*: queue
derivation ordered by agent-safety, and scope computed from the scan. Stage C must
not drift back into selling the surface.

- **MCP server** exposing `queue` → `route` → `prompt` (and `review-pr`), so an
  agent can ask "what is my next safest task, and what am I allowed to touch?"
  This is W6 from the prior design, unchanged in substance.
- **`settings.json` deny-block emitter.** Aker Build computes the forbidden set;
  Claude Code's deny-first permission engine enforces it. Derivation feeding
  platform enforcement — the reframe from "Genuinely unoccupied territory §2".

  **Caveat that must ship with the claim.** Claude Code deny rules govern Claude's
  own file tools; they do not stop arbitrary subprocesses. So the handoff is
  "stronger than an advisory prompt", not "airtight". State this wherever the
  emitter is documented. This document spent its length retiring overclaims; it
  must not introduce a fresh one here.
- **README repositioned** around the queue as headline, detectors as supporting
  evidence.

**Exit criteria.** An agent completes a full ask→route→scoped-prompt loop against
a real repo through MCP; emitted deny-block verified to actually constrain a
Claude Code session.

**Dependency.** Requires Stage B (an unpublished MCP server has no consumers) and
Stage A (routing decisions inherit finding credibility).

**Constitution check.** Report-only wall holds: the MCP server exposes advice and
computes scope. It does not execute agents, mutate code, or auto-merge. Emitting a
`settings.json` block is *output*, applied by the user — not mutation by the tool.

## Principles (all stages)

- Detectors stay read-only, evidence-emitting, judgment-free; confidence tiers
  encode uncertainty rather than hiding it.
- No secrets in outputs; no source stored in any hosted surface.
- Every stage ships through spec → plan → tasks with owner review.
- Failure honesty: unreadable files, unmatched frameworks, and threshold misses
  are reported, never swallowed. Stage A extends this principle from runtime
  behaviour to the marketing surface.
- Cite complements (pgrls, Spec Kit, Claude Code permissions) rather than
  overclaiming against them. A tool that names its neighbours accurately is more
  credible than one that claims to subsume them.

## Out of scope (unchanged non-goals)

Hosted dashboard (P5), enforcing/blocking checks (P6), agent execution, auto-fix,
auto-commit, auto-merge, AST-parser rewrite, Retail Tower / ERPNext logic,
lockfile changes without explicit approval.

Specifically rejected for this cycle: competing with pgrls on database-layer RLS
analysis, and scoring against OWASP Benchmark (Java, single-function granularity —
maps poorly to TypeScript architectural detection; noted only as a future option
if a comparable TS corpus emerges).

## Open questions for review

1. **Is the claim shift approved?** Demoting detectors from headline to supporting
   evidence is load-bearing for all three stages.
2. **How far may the scorecard drop before it is a launch blocker?** Stage A is
   designed to reduce it; a floor should be agreed in advance rather than
   negotiated after the number is known.
3. **Which OSS repos for Stage B?** They must be genuinely multi-tenant
   TypeScript, and running against them must respect their licences (read-only
   analysis, findings published with attribution).
4. **How is "what it missed" established on a repo with no ground truth?** Choose
   between manual sampling, cross-tool differential against pgrls/Semgrep, or
   narrowing the claim to coverage. Blocks Stage B planning, not Stage A.

## Stage A outcome (recorded 2026-07-30)

Stage A is implemented. The recorded branch is **floors tripped** —
`benchmark/thresholds.json` was **not modified**.

### Measured result

| Gate | Tier | Precision | Recall | TP | FP | FN |
|---|---|---|---|---|---|---|
| TG-G3 | confirmed | 100% | 100% | 1 | 0 | 0 |
| TG-G3 | suspected | 100% | 100% | 1 | 0 | 0 |
| TG-G4 | confirmed | 100% | 100% | 2 | 0 | 0 |
| TG-G4 | suspected | 100% | **50%** | 2 | 0 | 2 |
| TG-G5 | confirmed | — | — | 0 | 0 | 0 |
| TG-G5 | suspected | 100% | 100% | 2 | 0 | 0 |

Corpus grew 15 → 18 cases. `TG-G4 suspected` recall fell 100% → 67%
(`window-bleed-false-negative`) → 50% (`model-first-orm`).

**CI is red**: `TG-G4 suspected recall 0.50 < floor 0.85`
(`packages/eval/tests/ci-gate.test.ts`). This is the designed outcome, not a
regression. The floor was already correctly placed; it had nothing to catch
because the corpus contained no case the detector fails. One honest case
converted a decorative gate into a live one.

**Decision required from the owner** (this is the recorded decision point; do not
resolve it by editing the floor):

- **Fix the detectors** — statement-bounded windows and framework signature packs
  (the pre-existing W3b scope). Restores recall by making the engine better.
- **Lower the floor with a written reason**, documenting both uncovered patterns
  as accepted v0 limitations, and raise it again when W3b lands.

### CI consequence that affects the cost of waiting

Two jobs in `.github/workflows/aker-build.yml` are affected, and they differ in
kind:

1. **`benchmark` job** (`pnpm dlx tsx packages/eval/src/bin.ts`) fails on the
   breach. This is the regression gate doing exactly its job — intended.
2. **`release-integrity` job** (`pnpm test`) is the problem. `pnpm -r` **halts at
   the first failing package**, and `@aker-build/eval` sorts before `prompt`,
   `review`, `report`, `cli`, `github-app`, and `github-app-server`. Those
   packages' tests (≈220 tests) will not *fail* — they will silently **never
   run** on any future PR until the threshold decision is resolved.

Consequence 2 raises the cost of "leave the floor and fix the detectors later":
the repository would lose test coverage on six packages in the interim, and the
loss would be invisible in the CI summary (one red job, no signal that others
were skipped). Verified locally with
`pnpm -r --filter '!@aker-build/eval' test` — all six pass today (391 tests
total, 3 pre-existing skips).

If the owner chooses to leave the floor tripped, the workflow should be adjusted
so the benchmark breach does not mask the rest of the suite (e.g. run the eval
package's tests as their own step, or make the recursive run non-halting). That
adjustment is **not** made here: it changes CI semantics and belongs to the
owner's decision, not to Stage A.

### Findings surfaced during implementation

1. **The corpus is small enough that percentages mislead.** All rates rest on
   **8 true positives**; `TG-G4 confirmed` — the tier P6 would eventually block
   merges on — rests on **2**. A single miss there would read as 50%. The README
   now publishes absolute TP/FP/FN counts alongside the rates for this reason.
   Growing the corpus is the real remedy, and it outranks tuning any floor.
2. **A `confirmed`-tier false positive was found and closed during the work.**
   The first `clean-auth` draft guarded an admin route with `requireAdmin`, which
   `g4-security.ts:12` does not list in `ROLE_GUARD`; the gate correctly fired at
   `confirmed`, dropping precision to 67%. The **fixture** was corrected to
   `requireRole` rather than widening the detector to suit the test. Worth noting
   for P6: `confirmed`-tier precision depends on `ROLE_GUARD` naming coverage, and
   an unlisted-but-legitimate guard name is a merge-blocking false positive
   waiting to happen. A guard-name audit belongs in P6's preconditions.
3. **`TG-G5 confirmed` has a threshold but no data** (`—`, zero findings), so it
   is a floor guarding nothing — the same decorative-gate pattern this stage
   removed from G4. Either give it a positive case or drop the threshold.
4. **`TG-G7` remains outside the corpus entirely.** It has a gate
   (`g7-observability.ts`) but no case and no threshold. Adding only a clean case
   would have created a fresh trivially-1.0 row, so it was deliberately excluded;
   G7 joins when it gets a positive case and a threshold together.

## Uncertainty flags from the research

- Semgrep MCP tool names unverified (docs returned 405).
- OpenSpec's reported star count implausible; treated as unverified.
- DeepSource and Macroscope benchmark numbers are self-reported vendor claims.
- The Cursor/Graphite acquisition (Dec 2025, Diamond merging into Bugbot) is from
  a secondary source, medium confidence.
