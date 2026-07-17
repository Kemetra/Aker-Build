# P4 (in-repo core) — GitHub Checks Renderer — Design

Status: Designed, pending plan + review
Date: 2026-06-19
Roadmap: `docs/roadmap/2026-06-19-future-phases-fortify-and-expand.md` (P4 — first Expand phase)
Builds on: P1 (detectors) + P2 (confidence tiers, merged) + P3 (proven findings).

## Scope decision (locked)

P4 in the roadmap is a *report-only GitHub App* (webhooks, install, auth, hosting). That external
surface is constitution-deferred and can't be end-to-end tested in-repo. **This spec plans only the
in-repo, fully-testable core:** a pure function that turns the existing `ReviewReport` into the
data shape a GitHub Checks run + inline annotations expects. The webhook server / GitHub App auth /
hosting are explicitly **out of scope** — a separate infra spec, when that surface is approved.

> Why this slice is the right one: the App's *value* and its *constitution risk* both live in the
> output mapping (what blocks, what's advisory, what gets annotated where). That mapping is pure
> data and testable. The transport (webhooks/auth) is undifferentiated plumbing that adds no
> Aker Build-specific logic and pulls in the deferred hosted surface. Build the brain, defer the
> pipes.

## What already exists (reuse)

- **`ReviewReport`** (`packages/review/src/types.ts`) — the renderer's input: `verdict`,
  `changed_files`, `findings[]` (each a gate finding with `evidence[]`, or a scope violation),
  `pr?` metadata.
- **`renderReport(report): string`** (`render.ts`) — the existing markdown renderer; the new
  Checks renderer is a sibling with the same input, different output.
- **`confidenceTier(finding)`** — already a review dependency (P2 wired it into the verdict). Drives
  annotation severity here too.

## Decision 1 — Output shape (mirror GitHub's Checks API, but as plain data)

A pure `renderChecksPayload(report: ReviewReport): ChecksPayload` returning:

```ts
interface ChecksPayload {
  name: string;                 // "Aker Build"
  conclusion: "success" | "neutral" | "failure";
  title: string;                // e.g. "Not ready — 1 confirmed risk"
  summary: string;              // the existing renderReport() markdown, reused verbatim
  annotations: CheckAnnotation[];
}
interface CheckAnnotation {
  path: string;
  start_line: number;           // >=1; GitHub requires it
  end_line: number;             // = start_line (single-line evidence)
  annotation_level: "failure" | "warning" | "notice";
  title: string;                // gate id (or "scope") + short label
  message: string;              // the evidence signal / scope reason (NEVER a secret value — FR-009)
}
```

**`ReviewFinding` is a discriminated union — branch on the discriminant FIRST** (mirror
`render.ts`'s `"kind" in f` check, the proven template). Per finding, produce ONE annotation
keyed on its primary location:

- **scope violation** (`"kind" in f`): `path = f.file`, `start_line = 1`, `annotation_level =
  "failure"`, message from `f.reason`. **Never** access `.evidence` or call `confidenceTier` on
  this arm (it has neither — doing so throws a TypeError).
- **gate finding**: `path = f.evidence[0]?.path ?? "(unknown)"`; `start_line = f.evidence[0]?.line
  ?? 1` (evidence `line` is genuinely nullable — confirmed in `render.ts:73` — so this fallback is
  real); `annotation_level` per Decision 2; `message = f.evidence[0]?.signal ?? ""`. One annotation
  per finding on its first evidence item (the markdown lists all evidence; the Checks payload picks
  the primary location — documented simplification).

This is plain data — no `@octokit`/network dependency. The (deferred) webhook layer would POST it;
the renderer just produces it. Keeps the package dependency-light and the unit tests pure.

## Decision 2 — Tier drives annotation level (the P2 payoff)

The mapping that makes the App trustworthy and un-spammy:

| Finding | annotation_level | Contributes to conclusion? |
|---|---|---|
| `risk`, `confirmed` (high evidence) | `failure` | yes → `failure` |
| `risk`, `suspected` (medium/low) | `warning` | no — advisory only |
| `needs_verification` | `notice` | no |
| scope violation | `failure` | yes → `failure` |

`conclusion` = `failure` iff the verdict is `not_ready` (which P2 already made "confirmed-only"); a
`needs_verification` verdict → `neutral`; `ready` → `success`. So the Checks conclusion inherits
P2's calibrated, confirmed-only blocking rule for free — no second gating logic to keep in sync.

**Constitution wall preserved in data:** the payload only ever sets a *status* and *comments* —
there is no field that commits, merges, or mutates. Report-only is structurally guaranteed by the
shape, not just by policy.

## Decision 3 — Annotation hygiene

- **No secret values:** `message` is the evidence `signal` (a description), never matched content —
  same FR-009 rule the gates already follow. A unit test asserts a secret-in-log finding's
  annotation contains no secret-like value.
- **Line fallback:** GitHub annotations require `start_line >= 1`; evidence with a null/absent line
  (file-level) maps to `start_line = 1` and a title noting it's file-level.
- **Determinism:** annotations sorted by `(path, start_line, gate_id)` so the same report yields a
  byte-identical payload (matches the existing review SC-007 discipline).
- **Cap with honesty:** GitHub accepts at most 50 annotations *per Checks-API request* (the
  deferred transport would batch beyond that). For this single-payload slice, emit the first 50
  sorted annotations and append a "+M more — see full report" line to the `summary`; never silently
  drop (the count is stated). This is a per-payload cap, not a hard total ceiling on findings.

## Non-goals

- No webhook server, GitHub App registration, private-key auth, or hosting — separate infra spec.
- No `@octokit` / network dependency in this package — the renderer is pure data.
- No new gating logic — `conclusion` is derived from the existing `verdict`.
- No mutation/commit/merge field anywhere in the payload (report-only, structural).
- No `SCHEMA_VERSION` bumps to existing artifacts; `ChecksPayload` is a new in-memory shape (not a
  persisted versioned artifact unless a later spec needs it).

## Testability

- Pure unit tests over synthetic `ReviewReport`s: a confirmed risk → one `failure` annotation +
  `conclusion: failure`; a suspected risk → `warning` annotation + non-failure conclusion; a clean
  report → `success`, no annotations.
- **Scope-only report (no gate findings)** → `conclusion: failure` with a file-keyed annotation
  (`path = f.file`, `start_line: 1`) — the union arm most likely to rot; must not throw.
- **Non-1 line mapping:** at least one test finding carries `evidence[0].line = 42` and the
  annotation's `start_line` is 42 (not just the fallback) — proves real line mapping, not only the
  fallback path.
- Secret hygiene: a secret-in-log finding's annotation message contains no secret-like value.
- Line fallback: file-level evidence (null line) → `start_line: 1`.
- Determinism: same report → deep-equal payload across two calls.
- Cap: a report with >50 findings emits 50 annotations + a stated "+M more" summary line.
