# Feature Specification: Launch & Community Strategy

**Feature Branch**: `009-launch-and-community-strategy`
**Created**: 2026-06-18
**Status**: Reviewed strategy - execution pending; 010 handles release-readiness and first-run demo prerequisites.
**Input**: User description: "Create a docs-only specification for TenantGuard's launch and community strategy: launch purpose, target audience, core marketing message, GitHub repo readiness checklist, pre-launch checklist, launch channels, content plan, growth loops, success metrics, launch stages, non-goals, acceptance criteria, and dependencies. Docs only; no production code."

**Depends on**: `001-product-foundation` (positioning, MVP scope, non-goals, principles)
**Blocks**: — (informs later README/demo/community work; does NOT block CLI implementation)

---

## Purpose *(mandatory)*

This spec defines **how TenantGuard reaches its first users and earns its first community**, as a
written, reviewable strategy — not as marketing code or a website. It exists so that when the CLI
MVP (specs `003`–`007`) is implemented and reviewed, the team can execute a launch from a prepared,
agreed plan instead of improvising.

It defines the launch *purpose, audience, message, readiness checklists, channels, content plan,
growth loops, metrics, stages, and non-goals*. It deliberately does **not** define the CLI, write
any marketing site, or commit the project to spend. The binding product surface here is the
**strategy and its guardrails** (especially the non-goals), not any specific copy or asset.

One-line framing for the launch:

> Stop giving AI agents your whole repo. Give them safe task boundaries.

---

## User Scenarios & Testing *(mandatory)*

"Users" here are the **maintainer/team executing the launch** and the **first developers who
discover TenantGuard**. The "system" is the launch plan plus the public repo it points at.

### User Story 1 - Execute a credible launch from a prepared plan (Priority: P1)

A maintainer, once the CLI MVP is reviewed, opens this spec and works a concrete, ordered checklist
(repo readiness → pre-launch → channels) to ship a launch without inventing the plan on the day.

**Why this priority**: The launch is a one-shot reputational event. A repo that trends with a broken
README or no demo wastes the moment. A prepared, reviewed plan is the whole value of this spec.

**Independent Test**: Hand the spec to someone unfamiliar with the project and confirm they can
produce a launch-readiness status (every checklist item is either done, in-progress, or N/A with a
reason) without asking the author what to do next.

**Acceptance Scenarios**:

1. **Given** a reviewed CLI MVP, **When** the maintainer follows the GitHub repo readiness checklist,
   **Then** each item has an unambiguous done/not-done state and a place to put evidence (a link/path).
2. **Given** the pre-launch checklist, **When** it is worked top-to-bottom, **Then** no launch channel
   is posted to until its prerequisite readiness items pass.
3. **Given** the launch is executed, **When** results are recorded, **Then** they map onto the defined
   success metrics and the current launch stage.

### User Story 2 - A first-time visitor understands and tries it in minutes (Priority: P2)

An indie hacker arrives from a post or a search, reads the README, runs the demo against an example
repo, and understands the value (safe, scoped AI-agent task boundaries + evidence-backed PR review)
without contacting anyone.

**Why this priority**: Activation, not just attention. Stars without a working first-run convert
poorly and damage credibility. This is what turns reach into real usage.

**Independent Test**: A new visitor, given only the public repo, can run the documented demo on the
example repo and produce a `tenantguard-report.md` (or equivalent MVP output) without help.

**Acceptance Scenarios**:

1. **Given** the repo, **When** a newcomer reads the README top section, **Then** they can state in one
   sentence what TenantGuard does and who it is for.
2. **Given** the documented quickstart, **When** a newcomer runs it, **Then** they reach a real CLI
   output (map/risks/queue/prompt/report) in a small, bounded number of steps.

### User Story 3 - A contributor finds a clear way in (Priority: P3)

An open-source maintainer or interested developer wants to help, finds `CONTRIBUTING.md`, picks a
labeled "good first issue," and opens a scoped PR that the project's own gates can review.

**Why this priority**: Community durability. A launch that gathers stars but no contributors stalls;
a clear contribution path compounds.

**Independent Test**: A contributor can, from the repo alone, identify how to set up, what to work on
(a "good first issue"), and the PR expectations, without a maintainer explaining it.

---

### Edge Cases

- **Launch before CLI value is real**: if the MVP is not implemented and reviewed, the launch MUST
  NOT proceed — readiness checklists gate it (no "coming soon" launch that burns the moment).
- **A channel's community norms forbid self-promotion**: the plan MUST respect each platform's rules
  (e.g. value-first posts, no drive-by links) rather than spamming.
- **Low initial traction**: stages are defined so a slow start is a known state with next actions,
  not a failure that triggers prohibited tactics (buying stars/engagement).
- **Negative/critical feedback at launch**: treated as content and roadmap input, handled in public
  with evidence — never deleted or astroturfed over.
- **Arabic-community reach**: content for Arabic tech communities is genuine localization/translation
  of the same value message, not a separate or inflated claim set.

---

## Launch Purpose *(mandatory)*

- Establish TenantGuard's public positioning: **PR guardrails for AI-generated SaaS code** —
  "build SaaS with AI agents without losing architecture control."
- Convert attention into **activation** (a successful first CLI run) and **durable community**
  (contributors, real-repo usage), not vanity metrics.
- Do all of the above **honestly and within each platform's rules**, consistent with the
  constitution's no-hidden-mutation / source-truth ethos applied to marketing.

---

## Target Audience *(mandatory)*

| Audience | Primary pain TenantGuard speaks to |
|----------|------------------------------------|
| Indie hackers using Claude / Codex / Cursor | AI agents change too many files; no safe task boundaries |
| SaaS founders | Shipping fast with AI while keeping architecture and tenant isolation intact |
| Agencies building SaaS for clients | Need repeatable guardrails and review evidence across many client repos |
| Tech leads reviewing AI-generated PRs | PRs pass tests but break boundaries; hard to verify scope quickly |
| Open-source maintainers | Want evidence-backed, scoped contributions and a clear review bar |

Primary beachhead: **indie hackers and small teams already using AI coding agents** — they feel the
"agent touched the whole repo" pain most acutely and adopt CLI tools fastest.

---

## Core Marketing Message *(mandatory)*

Primary message:

> **PR guardrails for AI-generated SaaS code.** Build SaaS with AI agents without losing architecture control.

Supporting one-liners (consistent, not contradictory):

```text
- Stop giving AI agents your whole repo. Give them safe task boundaries.
- Evidence over assumptions: every risk and verdict cites a file, line, or failed check.
- It observes, reports, and recommends — it never commits, pushes, or merges for you.
```

The message MUST stay aligned with `001` positioning and MUST NOT overclaim beyond shipped MVP
capability (no promises of features that are deferred, e.g. hosted dashboard or GitHub App).

---

## GitHub Repo Readiness Checklist *(mandatory)*

Each item is launch-gating. State for each: done / in-progress / N/A (with reason) + evidence link.

```text
[ ] Polished README — value in the first screen, quickstart, honest scope, links
[ ] CLI demo — a documented, runnable quickstart against the example repo
[ ] Terminal GIF or screenshot — shows a real run (scan → report) in the README
[ ] Example repo — a sample SaaS-shaped repo the demo runs against (from a later spec, not this one)
[ ] LICENSE — an OSI-approved open-source license present at repo root
[ ] CONTRIBUTING.md — setup, dev workflow, PR expectations, code of conduct pointer
[ ] Good first issues — several scoped, labeled issues a newcomer can complete
[ ] GitHub topics — relevant discoverability topics set on the repo
[ ] Roadmap — public, honest (MVP shipped vs. deferred waves), linked from README
```

---

## Pre-Launch Checklist *(mandatory)*

```text
[ ] CLI MVP implemented AND reviewed (specs 003–007) — HARD GATE, no launch before this
[ ] All GitHub repo readiness items above are done or justified N/A
[ ] Quickstart verified by someone who did not write it (cold first-run succeeds)
[ ] Message + claims checked against shipped capability (no overclaiming, no deferred features as "now")
[ ] No secrets anywhere in repo, demo output, screenshots, or example repo
[ ] Channel-specific posts drafted and adapted to each platform's norms (not copy-paste spam)
[ ] Success metrics + tracking method agreed before posting (so results are measurable)
[ ] A response plan for issues/criticism (answer in public, with evidence)
```

---

## Launch Channels *(mandatory)*

Each channel is used per its own community norms; value-first, no spam, no undisclosed promotion.

```text
GitHub                  — the home; repo + topics + discussions/issues
X / Twitter             — short threads on the core pains (unscoped agents, PR safety)
LinkedIn                — founder/tech-lead framing (architecture control, review evidence)
Hacker News             — Show HN with an honest, working demo and clear scope
Product Hunt            — launch listing once the demo and README are polished
Reddit / devtools communities — value-first posts where self-promo is permitted by rules
Dev.to                  — long-form how-it-works and use-case articles
Indie Hackers           — building-in-public + the indie-hacker pain framing
Arabic tech communities — genuine localized/translated value message for Arabic-speaking devs
```

Sequencing principle: warm up owned/honest surfaces (GitHub, Dev.to, X) before high-variance
one-shot surfaces (Hacker News, Product Hunt), so the latter point at an already-credible repo.

---

## Content Plan *(mandatory)*

Themes, each tied to a real product capability so claims are demonstrable:

```text
- Unscoped AI agents      — the core pain; why "whole repo to the agent" breaks architecture
- PR safety               — Ready / Not Ready / Needs Verification with evidence
- Security / tenant boundaries — TG-G4: catching unguarded routes, admin routes without role guards, and secrets in logs before they ship
- Architecture gates      — TG-G1/G2: boundary and contract drift, with file/line evidence
- Prompt boundaries       — safe, scoped agent prompts (allowed/forbidden files, stop conditions)
```

Each piece MUST be backed by a real CLI behavior or output (a map, a finding, a compiled prompt, a
review verdict) — content demonstrates the tool, it does not describe vaporware.

**No-vaporware mapping — verified against merged code (SC-002 / FR-005).** Every theme is backed by a
shipped capability (features 004/006/007 are merged on `main`):

| Theme | Shipped capability (merged) |
|-------|-----------------------------|
| Unscoped AI agents | conceptual framing of the core pain (no claim of a feature) |
| PR safety (Ready / Not Ready / Needs Verification + evidence) | `packages/review/src/verdict.ts` (007) |
| Security / tenant boundaries (TG-G4: unguarded routes, admin-route role guards, secrets-in-logs) | `packages/gates/src/gates/g4-security.ts` (004) |
| Architecture gates (TG-G1/G2) | `packages/gates/src/gates/g1-architecture.ts` + `g2-contract.ts` (004) |
| Prompt boundaries (allowed/forbidden files, stop conditions) | `packages/prompt/src/scope.ts` + `defaults.ts` (006) |

This mapping is the launch's honesty guarantee: the plan markets only what the kernel already ships.

---

## Growth Loops *(mandatory)*

Mechanisms where usage produces visibility that drives more usage:

```text
- README badge        — a "Guarded by TenantGuard" badge users add to their own repos
- Shareable report    — tenantguard-report.md is clean, self-explanatory, and link-friendly to share
- CI summary footer    — a small, honest attribution line on PR summaries (later, with the Action)
- Stack templates     — starter configs/templates for popular SaaS stacks lower first-run friction
```

Every loop MUST be opt-in and honest (no dark patterns, no forced attribution, no inflated claims).
The CI-summary-footer loop depends on the GitHub Action (`008`) and is therefore a later-wave loop,
not a launch-day mechanism.

---

## Success Metrics *(mandatory)*

Balanced across attention, activation, and durability — activation/usage weighted over vanity:

```text
- GitHub stars        — attention (necessary, not sufficient; never bought)
- npm downloads       — distribution/install signal
- demo runs           — activation: people actually ran the CLI
- issues opened       — engagement and real-world friction surfaced
- contributors        — community durability (PRs merged from non-core authors)
- real repo usage     — the strongest signal: TenantGuard run against real, non-example repos
```

A launch that gains stars but no demo runs / issues / real usage is explicitly treated as
*under-performing*, not successful.

---

## Launch Stages *(mandatory)*

```text
First 100 stars  — validation: honest reach + a handful of real demo runs and first issues.
                   Focus: fix first-run friction fast; convert curiosity into activation.
500 stars        — traction: repeated real-repo usage, first external contributors, recurring
                   content cadence. Focus: contributor on-ramp and stack templates.
1000+ stars      — momentum: sustained usage and contribution; consider next approved waves
                   (Action adoption, more stacks). Still no paid acquisition or enterprise motion.
```

Stars are a coarse proxy; each stage's *real* gate is the activation/usage metrics, not the count.

---

## Non-Goals *(mandatory)*

```text
- No paid ads in MVP.
- No fake stars.
- No buying engagement (no bought followers, votes, or comments).
- No enterprise sales motion yet.
- No hosted dashboard launch before CLI value is proven.
- No marketing website code, dashboard code, or GitHub App code created by this spec.
- No overclaiming deferred features (App, dashboard, auto-fix) as currently available.
- No Retail Tower / ERPNext / POS-specific positioning or domain content.
```

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The spec MUST define the launch purpose, target audience, and a single consistent core
  marketing message aligned with `001` positioning.
- **FR-002**: The spec MUST provide a GitHub repo readiness checklist and a pre-launch checklist whose
  items are individually checkable (done / not-done / N/A-with-reason).
- **FR-003**: The pre-launch checklist MUST hard-gate the launch on the CLI MVP (specs `003`–`007`)
  being implemented and reviewed; no launch may proceed before that.
- **FR-004**: The spec MUST enumerate launch channels and require each to be used per that platform's
  community norms (value-first, no spam).
- **FR-005**: The spec MUST define a content plan in which every theme maps to a real, demonstrable
  product capability (no vaporware claims).
- **FR-006**: The spec MUST define growth loops that are opt-in and honest, and MUST mark any loop
  that depends on later waves (e.g. CI footer ← `008`) as not-launch-day.
- **FR-007**: The spec MUST define success metrics that weight activation and real usage over vanity
  metrics, and MUST define launch stages (100 / 500 / 1000+ stars).
- **FR-008**: The spec MUST forbid fake stars, bought engagement, paid ads (in MVP), enterprise sales
  motion, and a hosted-dashboard launch before CLI value is proven.
- **FR-009**: The spec MUST NOT introduce or require any production code, marketing-site code,
  dashboard code, GitHub App code, `package.json`, lockfile, or GitHub Action.
- **FR-010**: The spec MUST NOT block or reorder CLI implementation; it depends on `001` and only
  *informs* later README/demo/community work.
- **FR-011**: The spec MUST require that no secrets appear in the repo, demo output, screenshots, or
  example repo used for launch.
- **FR-012**: The spec MUST be domain-neutral — no Retail Tower / ERPNext / POS positioning.

### Key Entities

- **Launch Plan**: this document — purpose, audience, message, checklists, channels, content, loops,
  metrics, stages, non-goals.
- **Readiness Checklist Item**: a single checkable launch prerequisite with a done/N/A state + evidence.
- **Launch Channel**: a platform with its own posting norms and a drafted, adapted message.
- **Content Theme**: a messaging pillar bound to a demonstrable CLI capability.
- **Growth Loop**: an opt-in mechanism turning usage into visibility.
- **Success Metric**: a measurable launch outcome (attention / activation / durability).
- **Launch Stage**: a milestone band (100 / 500 / 1000+ stars) with focus and gating usage signals.

---

## Required Outputs *(mandatory)*

```text
specs/009-launch-and-community-strategy/spec.md   this reviewed launch & community strategy
```

No other artifacts (no website, no scripts, no assets) are produced by this feature.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person unfamiliar with the project can derive a complete launch-readiness status
  (every checklist item resolved to done / not-done / N/A-with-reason) from this spec alone.
- **SC-002**: 100% of content themes map to a real, shipped CLI capability (zero vaporware claims).
- **SC-003**: The launch is gated: with the CLI MVP not yet reviewed, the pre-launch checklist
  evaluates to "not ready to launch."
- **SC-004**: Success metrics include at least one activation metric (demo runs) and one durability
  metric (contributors or real-repo usage), not only stars.
- **SC-005**: Zero prohibited tactics (fake stars, bought engagement, paid ads in MVP) appear as
  permitted actions anywhere in the plan.
- **SC-006**: The spec creates zero production / marketing-site / dashboard / App / package / lockfile
  / Action files.
- **SC-007**: The launch plan, if executed, does not require any change to or delay of CLI
  implementation (it consumes `001`, blocks nothing).

---

## Acceptance Criteria for This Feature *(mandatory)*

- **AC-001**: Launch purpose, target audience, and a single consistent core message are stated.
- **AC-002**: GitHub repo readiness checklist and pre-launch checklist are present and checkable.
- **AC-003**: The CLI-MVP-reviewed hard gate on launch is explicit.
- **AC-004**: Launch channels (GitHub, X, LinkedIn, HN, Product Hunt, Reddit/devtools, Dev.to, Indie
  Hackers, Arabic tech communities) are listed with a norms-respecting usage rule.
- **AC-005**: Content plan (unscoped agents, PR safety, security / tenant boundaries, architecture
  gates, prompt boundaries) is present and each theme ties to a real, demonstrable capability.
- **AC-006**: Growth loops (README badge, shareable report, CI footer, stack templates) are present,
  opt-in, and later-wave loops are marked as such.
- **AC-007**: Success metrics and launch stages (100 / 500 / 1000+) are defined, activation-weighted.
- **AC-008**: Non-goals (no paid ads in MVP, no fake stars, no bought engagement, no enterprise motion
  yet, no dashboard launch before CLI value) are explicit.
- **AC-009**: Dependencies are explicit: depends on `001`; does not block CLI implementation; informs
  later README/demo/community work.
- **AC-010**: No production code, marketing-site code, dashboard code, GitHub App code, `package.json`,
  lockfile, or GitHub Action is created by this feature.
- **AC-011**: The spec is domain-neutral and secret-free.

---

## Dependencies

- **Depends on `001-product-foundation`**: positioning, MVP scope, non-goals, and principles are the
  source of truth this strategy must stay aligned with.
- **Does NOT block CLI implementation**: `003`–`007` proceed independently of this spec; the launch is
  a downstream consumer of a finished, reviewed CLI, not a prerequisite for building it.
- **Informs later work**: README polish, the CLI demo, the example repo, and community assets are
  executed later (some via other specs); this spec is the agreed plan they realize.

---

## Assumptions

- **Strategy, not execution.** This spec is a reviewable plan; actually writing posts, recording the
  GIF, building the example repo, or adding the badge are later, separately-scoped tasks — and some
  (example repo, the Action, CI footer) belong to other specs/waves.
- **Open-source distribution.** TenantGuard launches as an open-source CLI (npm-distributable);
  npm-downloads as a metric assumes public package distribution, decided at plan/ADR layer.
- **License choice deferred** to the plan/ADR layer; the readiness checklist requires *a* permissive
  OSI license, not a specific one.
- **Example repo is external** to this feature (referenced as a later spec, e.g. the blueprint's
  example-project), not created here.
- **Metric thresholds** (100 / 500 / 1000 stars) are coarse milestone bands for planning rhythm, not
  guarantees or targets to be gamed; the binding signals are activation and real usage.
- **Arabic-community content** is genuine localization of the same honest message, reflecting the
  maintainer's reach, not a separate inflated claim set.
