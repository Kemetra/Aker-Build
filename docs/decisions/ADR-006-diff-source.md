# ADR-006: Diff source — read-only `git`/`gh` CLI, no diff-parsing dependency

**Status**: Accepted
**Date**: 2026-06-18
**Context feature**: `007-pr-reviewer`
**Relates**: ADR-001 (tech stack), ADR-002 (CLI framework), ADR-003/004/005

## Context

The PR Reviewer (`007-pr-reviewer`) evaluates a change — a **local diff** or a **GitHub PR** — against
the shipped 004 SaaS gates and an optional declared scope, returning a Ready / Not Ready / Needs
Verification verdict. The spec defers the *diff/GitHub-client library* to the plan layer while pinning
the review behavior and verdict model. The reviewer needs the **set of changed file paths** to (a)
attribute 004 findings to the diff (evidence `path` ∈ changed files) and (b) run the optional scope
check. It does **not** need hunk-level parsing in v0 (the gates are evidence/signal-based, not
line-diff-aware; a full diff-aware static-analysis engine is a Non-Goal).

## Decision

Obtain the **changed-files set** from the user's existing tooling, read-only:

- **Local diff**: shell out to **`git diff --name-only`** (working + staged) plus untracked-file
  enumeration, normalized to repo-relative POSIX paths, de-duplicated, code-unit sorted.
- **GitHub PR**: use the user's existing **`gh` CLI** to list the PR's changed files (+ optional
  metadata). No bundled GitHub client; no stored tokens.

**No third-party diff/patch-parsing library** and **no bundled GitHub client**. 004 is consumed
verbatim — the reviewer runs the full gate set over current repo state, then filters by changed files.

## Rationale

- **v0 only needs paths, not hunks**: set-membership on evidence `path` is the only attribution
  mechanism 004 exposes (a `Finding` carries `gate_id`/`status`/`severity`/`evidence[]`, each evidence
  a `path`). A patch parser would add a dependency and machinery for data v0 doesn't consume.
- **Already-required, local-first tooling**: `git` is assumed by 003/004 (`isGitRepo`); `--name-only`
  output is deterministic and runs with no credentials (FR-004, SC-005). `gh` reuses the user's own
  auth, keeping Aker Build token-free and the PR path *additive* (FR-005/FR-006).
- **Read-only / No Hidden Mutation**: `git diff --name-only` and `gh` reads never mutate the repo, the
  diff, or the PR (Principle VI; FR-008).
- **No 004 edit**: running the shipped gate set over current state + path-attribution avoids any change
  to 004 — the discriminating constraint for 007 as an additive consumer.

## Alternatives considered

- **A diff/patch-parsing dependency (e.g. `parse-diff`)** — adds a dependency and hunk machinery the v0
  verdict doesn't use. Revisit only if line-level attribution is ever required.
- **Before/after double-scan** (diff two project-map scans) — needs a baseline checkout and state;
  strictly more complex with no v0 benefit. A single current-state review suffices.
- **Bundling Octokit / a GitHub App** — deferred per the constitution's technology baseline
  ("Octokit/GitHub App deferred until product pull"). The `gh` CLI covers v0 PR mode.

## Consequences

- `packages/review` holds `git.ts` (`changedFiles`), `gh.ts` (`prChangedFiles`/`prMetadata` +
  `GitHubUnavailableError`), `attribute.ts` (path-membership filter), `scope.ts`, `verdict.ts`,
  `render.ts`, `review.ts`, `io.ts`, `schema.ts` (Zod for `review.json`).
- Adding a richer diff base (e.g. `--base <ref>`) or a non-`gh` GitHub client is a later additive change
  behind the same `changedFiles` interface — no re-architecture.
- A Zod schema **is** added here (unlike 006's Markdown-only output): `review.json` is a consumed JSON
  artifact that 008 (the Action) parses for a verdict.
