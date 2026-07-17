# Aker Build Future Phases — Fortify, then Expand

Status: Approved 2026-06-21 (owner approval). FORTIFY (P1–P3) shipped; EXPAND begins with P4 (report-only GitHub App, spec 014).
Date: 2026-06-19
Scope: The roadmap layer **after** public launch. The near-term waves A–F
(`docs/roadmap/post-foundation-technical-plan.md`: contracts → config → npm →
Action → launch) are already settled. This document covers what comes next.

## Executive decision

After launch, Aker Build's single biggest risk is **not believed findings**.
Its entire value rests on `risks.json` being trusted. So the future roadmap is
ordered fortify-first, then expand:

```text
FORTIFY                                    EXPAND
─────────────────────────────────────     ──────────────────────────────────
P1  Deepen detection (credible findings)   P4  GitHub App (reach, report-only)
P2  Calibrate (false-positive control)  →  P5  Multi-repo / org view
P3  Prove it (eval harness + benchmark)    P6  Enforcing CI check (opt-in)
```

The ordering is a **dependency chain, not a preference**:

```text
P1 deepen detection  ──┐
P2 calibrate (tiers)  ──┼──► P3 prove ──► P4 GitHub App ──► P5 org view ──► P6 enforce
                        │     (precision/  (reach)          (aggregate)     (block confirmed,
   evidence ──► tiers ──┘      recall                                        override + audit)
                               per tier)
```

You cannot prove (P3) what isn't calibrated (P2); you cannot aggregate
trustworthily (P5) without versioned + tiered output; and you **must not**
enforce (P6) findings whose precision you have not measured (P3).

## Identity decision (locked)

Aker Build stays the **control plane, not an actor**. It scans, judges,
routes, and advises. It never runs agents, never mutates code, never
auto-commits, never auto-merges. Expansion grows *reach* (more eyes on the same
advisory output), never *hands on code*.

Explicitly rejected: a supervised "apply loop" that runs agents and proposes
fixes. That would break the trust model and the constitution
(`CLAUDE.md`: "Do not execute AI agents from the product in MVP",
"Do not store or print secrets", "no hidden mutation").

The strongest form this roadmap reaches is P6 — *binding advice* (block a merge
on proven findings, always overridable by a human with an audited reason). That
is advice with teeth, not an actor.

---

## FORTIFY

### Phase P1 — Deepen detection

**Problem.** Three detectors (`repos`, `secrets`, `stack` in
`packages/scanner/src/detect/`) feed ten gates (G0–G9). Gates like G4
(Security/Tenant Isolation), G3 (Migration Safety), and G5 (Idempotency) reason
about evidence the scanner barely collects. A gate is only as smart as its
inputs.

**Add — new read-only evidence detectors** that produce the structural evidence
the existing gates are starving for:

| Detector | Feeds | Evidence it collects |
|---|---|---|
| `routes` | G2, G4 | API endpoints, handlers, which routes touch tenant-scoped data |
| `data-access` | G4, G5 | DB query sites, ORM calls, presence/absence of tenant-id filters |
| `migrations` | G3 | migration files, destructive ops (DROP/ALTER), reversibility |
| `auth` | G4 | auth middleware, RBAC checks, unprotected handlers |
| `config-surface` | G6, G7 | env var usage, billing/usage hooks, log/metric emission points |

**Design principle.** Every detector stays **read-only and evidence-emitting**:
it adds fields to the project map; it never judges. Judgment stays in the gates.
A detector must not import gate logic. Each is its own file (~200 lines, one
responsibility) matching the existing `repos.ts` / `secrets.ts` / `stack.ts`
pattern — no new architecture, more of the proven one.

**Testability.** Given a fixture repo, assert the emitted evidence. Each
detector is independently testable.

### Phase P2 — Calibrate (false-positive control)

**Problem.** More detectors (P1) means more findings, means more chances to be
wrong. A security tool that cries wolf gets muted. This is where the #1
adoption threat (false positives → abandonment) lives. P1 makes findings
*deeper*; P2 makes them *believed*.

**Add — a confidence and evidence model on every finding:**

- **Confidence tiers per finding:** `confirmed` (structural evidence — e.g. a DB
  query with no tenant filter on a known tenant-scoped table) vs `suspected`
  (heuristic — e.g. a route name that *looks* admin-ish). Each finding carries a
  tier and the **evidence span** (`file:line` + the matched signal) that
  justifies it. No finding without a pointer to why.
- **Severity × confidence routing:** the queue/router sorts by *both*. A
  `confirmed/critical` G4 routes ahead of a `suspected/high`. Low-confidence
  findings are reported but never block.
- **Tunable thresholds via config:** extends the 013 config boundary so a repo
  can set "only surface `confirmed` findings for G7" — without silently
  suppressing anything. Suppressions stay audited and expiring (Wave D model).

**Why P2 before P3.** You cannot benchmark a finding engine with no notion of
confidence — the eval harness must measure precision/recall *per tier*.
"We catch 90% of real leaks at `confirmed`" is a provable claim; "we emit a lot
of findings" is not.

The confidence tier is the lever that lets the *same* engine serve both audit
mode ("show me everything") and CI mode ("block only what's certain" — exactly
what P6 needs).

### Phase P3 — Prove it (eval harness + benchmark)

**Problem.** After P1–P2, findings *look* credible. "Looks credible" ≠ "is
correct." Without measurement, every claim is an opinion, and any future
detector change can silently degrade quality.

**Add — a benchmark corpus + an eval harness:**

- **Labeled corpus** (`benchmark/cases/`): small self-contained fixture repos,
  each with ground truth — `expected.json` listing findings that *should* fire
  (true positives) plus clean variants that should fire *nothing* (true
  negatives). Cases drawn from real multi-tenant failure patterns: missing
  tenant filter, destructive migration, unprotected admin route, non-idempotent
  webhook, leaked secret. **Synthetic only — no Retail Tower / ERPNext private
  logic** (constitution hard rule).
- **Eval harness** (`packages/eval` or a `benchmark/` runner): runs
  `scan → gates` over each case, diffs actual findings vs `expected.json`,
  computes **precision / recall per confidence tier**. (This is why P2 came
  first — the metric is tier-aware.)
- **Scorecard artifact** (`benchmark-report.json` + markdown): the provable
  claim, versioned like every other output. "At `confirmed` tier: G4 recall
  0.92, precision 0.97." Doubles as launch evidence and a dogfood CI regression
  gate.
- **Regression detection** (`benchmark/thresholds.json`): if a PR drops recall
  below a floor or raises false positives above a ceiling, dogfood CI flags it.
  The tool's own quality is gated by the discipline it sells.

**Boundary discipline.** The harness is a separate package/dir that consumes
public `scan` / `gates` outputs only — never reaches into detector internals.
That keeps it honest (tests the contract, not the implementation) and doubles
as the external "does Aker Build work on my repo?" proof.

This is eval-driven development applied to a static analyzer: the corpus is the
test suite, but assertions are *statistical* (precision/recall), because a
detector that catches 19/20 leaks is shippable while a unit test failing 1/20 is
broken.

---

## EXPAND

Each expand phase grows reach over the now-proven advisory output. None of them
touch code.

### Phase P4 — GitHub App (report-only)

**Problem.** The value chain lives in a terminal + dogfood CI. To enter a
team's daily habit, findings must appear *where review happens* — on the PR.
The constitution parks the GitHub App; P4 is when it is safe to build, because
findings are now deep (P1), calibrated (P2), and proven (P3).

**Add:**

- A **report-only GitHub App**: installs on a repo, runs the existing
  `review-pr` chain per PR, posts findings as a **Checks run + inline PR
  annotations** (`file:line` from P2 evidence spans pay off directly here).
- **Constitution wall preserved:** no commits, no pushes, no auto-merge, no
  auto-fix, no agent execution. It comments and sets a check *status*; the human
  decides. This is the existing dogfood Action behavior, productized as an
  installable App.
- **Confidence tiers drive presentation:** `confirmed` findings render as
  failed/neutral checks with detail; `suspected` render as collapsed advisory
  notes — so the PR is not flooded.
- **Stateless by default:** computes from source truth per-PR; no database, no
  stored code. Keeps the secrets/data posture clean and defers the hosted-data
  question until P5 actually needs it.

### Phase P5 — Multi-repo / org view

**Problem.** P4 puts findings on one PR in one repo. The buyer for a
build-control kernel is the eng lead / platform team who owns *many* SaaS repos
and needs org-level answers: which repos have unresolved `confirmed` G4 leaks?
Which teams are accumulating migration risk? Is tenant-isolation posture
improving or drifting? No single-repo surface answers that.

**Add — aggregation over already-produced advisory artifacts (not new
judgment):**

- **Roll-up layer** that ingests per-repo `report.json` / `risks.json`
  (versioned outputs) and aggregates by repo × gate × confidence × age.
- **Trend tracking:** because every output is versioned and timestamped, P5
  shows *direction* — "G4 `confirmed` findings down 40% this quarter." The
  metric an eng leader renews for.
- **Read-only dashboard** (the parked "hosted dashboard," now justified):
  visualizes aggregated artifacts. **Stores findings metadata, never source
  code** — the App stays stateless (P4); the dashboard stores only the JSON
  reports teams choose to publish to it.
- **Identity boundary:** the dashboard *displays*; it never re-judges or
  mutates. All judgment stays in the CLI/gates engine. The dashboard is a lens —
  consistent with "control plane, not actor."

P5 is where versioned contracts (Wave C) and confidence tiers (P2) compound:
aggregation is trustworthy only if the JSON shape is stable across repos and
time, and trend lines are meaningful only if `confirmed` is tracked separately
from `suspected`. This is why the dashboard was correctly deferred — building it
before the contracts froze would mean rebuilding it after every schema drift.

### Phase P6 — Enforcing CI check (opt-in, much later)

**Problem & danger.** Everything so far is advisory — a team can ignore
findings. The natural mature-buyer ask is "make this a required check that
blocks a merge." This is the one phase touching the constitution's edge, so it
is deliberately last and opt-in.

**Add — with rails that keep it constitution-safe:**

- **Opt-in enforcement only:** a repo explicitly sets a policy ("block merge on
  any unresolved `confirmed` G4"). Default stays report-only forever. No repo is
  blocked without opting in.
- **Only `confirmed` findings can block** — never `suspected`. This is the
  reason P2's tiers and P3's proven precision are hard preconditions: you may
  only block on findings whose precision you have *measured* (e.g. "G4
  `confirmed` precision ≥ 0.97 on the benchmark"). Blocking on un-proven
  findings destroys trust on the first false positive.
- **Mandatory override + audit trail:** every block is overridable by a human
  with a recorded reason and expiry (reusing the audited-suppressions model from
  Wave D). The tool never has the final, unappealable say — it sets a gate, a
  human can open it, the override is logged.
- **Still no agent execution, no auto-fix, no auto-merge** — the wall holds. P6
  is the strongest form of *advice*, not an *actor*.

---

## Priority order

1. P1 — deepen detection (new read-only detectors).
2. P2 — calibrate (confidence tiers + evidence spans).
3. P3 — prove it (eval harness + benchmark corpus + regression thresholds).
4. P4 — GitHub App (report-only, on the PR).
5. P5 — multi-repo / org view (aggregate + trend, read-only dashboard).
6. P6 — enforcing CI check (opt-in, blocks `confirmed` only, override + audit).

## Hard non-goals (unchanged from the constitution)

```text
No running AI agents from the product.
No auto-fix, auto-commit, auto-merge.
No hidden mutation.
No storing or printing secrets.
No storing source code in any hosted surface (metadata/reports only, P5).
No Retail Tower private domain rules.
No ERPNext-specific rules.
No broad rewrites.
```

## The single next action

This roadmap is approved (2026-06-21). FORTIFY (P1 deepen detection, P2 calibrate,
P3 prove-it) is shipped, plus 013 config path scope. The next implementable slice is
now **P4 — the report-only GitHub App** (spec `014-github-app-report-only`), which
the merged Checks renderer was built to feed. Each phase ships as its own reviewed
spec → plan → tasks cycle, per the constitution's implementation boundary.

> Historical note: before approval, the original "single next action" was P1
> (`data-access` detector). That FORTIFY work is complete; P4 is the current frontier.
