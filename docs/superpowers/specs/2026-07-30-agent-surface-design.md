# Agent Surface Design (Spec 018)

**Date:** 2026-07-30
**Status:** Approved (design); implementation pending plan + tasks review
**Scope:** Spec 018 — Agent Surface. Spec 019 (Governed Loop) is sequenced after and out of scope here.

## Problem

Aker Build's control plane is already agent-shaped, but it has no agent-facing
surface. An agent can only drive it by knowing CLI verb names in advance, or by
a human wiring the MCP server by hand. There is no discoverable entry point, no
router skill, and no `AGENTS.md`. `.claude/skills/` contains Spec Kit skills
only — nothing Aker-Build-specific.

Seshat BI solved the same problem for BI work, and its solution decomposes into
four layers:

1. A self-describing **router skill** — an agent needs to know one name.
2. **Thin slash commands** — ~5 lines each, loading the skill and stating a contract.
3. A **one-next-action machine contract** — exactly one allowed action or a
   blocked stop, never a score.
4. A **governed loop** plus read-only governor tools, stopping at human gates.

Aker Build already has layer 3, and in a stronger form than Seshat's: `route
--stdout --format json` emits a single decision with `blocked[]` reasons, and
`nextTask()` returns *derived* `allowed_files` / `forbidden_files` plus the
evidence that justified them. Three read-only MCP tools are registered
(`aker_build_next_task`, `aker_build_compile_prompt`, `aker_build_deny_block`).

**The gap is layers 1 and 2 (this spec) and layer 4 (Spec 019).**

## Decomposition

| Spec | Delivers | Depends on |
|---|---|---|
| **018 — Agent Surface** | Router skill, thin slash commands, command-surface contract, hash-verified bundle | 016/017 pipeline (landed) |
| **019 — Governed Loop** | `/auto` contract, governor MCP tools, human-gate stop conditions | **018** |

018 lands first because 019's `/auto` command is delivered as a file inside
018's generated bundle. Building 019 first would mean hand-placing markdown that
018 later generates and hash-verifies.

## Binding constraints

From `CLAUDE.md`, and each one shapes a decision below:

- **"Do not execute AI agents from the product in MVP."** Seshat satisfies the
  equivalent rule by keeping its loop in markdown that Claude Code executes,
  while the `seshat` binary only ever emits the next action. 018 adds no
  execution of any kind; 019's loop must likewise live in the skill layer. An
  `aker-build auto` CLI command that drove an agent would break this rule.
- **"Implementation is allowed only through reviewed spec, plan, and tasks files."**
  This document is the design; implementation waits on plan + tasks.
- **"Do not make broad refactors."** 018 is additive: a new `distribution/`
  tree and a new `packages/plugin/` workspace member. No existing package
  internals change.
- **"Do not change lockfiles unless package changes are explicitly approved."**
  The generator uses Node built-ins and the existing esbuild dependency. No new
  runtime dependency, so no lockfile change.

## Architecture

Three layers with a strict one-way dependency:

```
distribution/agent-command-surface.yaml   ← the single authority
        │  (validated by contracts/agent-command-surface.schema.json)
        ▼
distribution/bundle-templates/claude/     ← reviewed source markdown
        │  skills/aker-build/SKILL.md
        │  commands/*.md
        ▼
scripts/build-agent-bundle.mjs            ← generator
        ▼
packages/plugin/dist/                     ← generated, hash-verified output
        .claude-plugin/plugin.json
        skills/aker-build/SKILL.md
        commands/*.md
        bundle-manifest.json
```

### The layering rule

The YAML **may reference a CLI verb but never define one.** CLI verbs stay owned
by `packages/cli/src/index.ts`. The agent surface is a projection of the CLI,
never a second source of truth.

This matters because a hand-maintained agent surface drifts from the kernel it
describes, and drift is precisely the failure Aker Build claims to prevent. A
product positioned as "build without losing architecture control" cannot ship a
control surface that silently disagrees with its own control plane.

### Bidirectional reconciliation

A contract test enforces both directions:

- A wrapper file present in `bundle-templates/` but absent from the YAML fails.
- A YAML entry with `status: shipped` and no wrapper template fails.

One direction alone is insufficient. Checking only YAML→wrapper lets an
unreviewed command ship; checking only wrapper→YAML lets the authority list
commands that do not exist. Together they make the surface *reviewed* rather
than *accumulated*.

## The command surface

Every entry carries `mode`, and in 018 every value is `read-only` — asserted in
CI, not maintained by habit.

| Command | `cli_verbs` | Intent |
|---|---|---|
| `help` | *(none)* | Print the accurate installed command map |
| `check` | `check` | Run the read-only chain; interpret findings as advisory |
| `next` | `route` | Return the one next-safest task with derived scope |
| `status` | `report` | Report produced-artifact state as recorded |
| `review` | `review-pr` | Ready / Not Ready / Needs Verification |
| `prompt` | `prompt` | Compile the safe scoped prompt for a queue item |

`help` carrying no CLI verb is load-bearing: it proves the surface can express a
command the CLI does not have, which is exactly what 019's `/auto` requires. If
every entry had to map to a verb, 019 would need a schema change.

`prompt` takes the queue item id as a command argument (`/aker-build:prompt Q-001`).

**Deliberately excluded:** `scan`, `map`, `gates`, `queue`. These are sub-steps
of `check`; wrapping them individually would invite an agent to run the chain out
of order and then read artifacts that do not correspond to one another.

### Schema fields

`contracts/agent-command-surface.schema.json` validates each entry:

| Field | Meaning |
|---|---|
| `name` | Slash command name (namespaced by Claude Code as `/aker-build:<name>`) |
| `platform` | Target agent platform; `claude` is the only accepted value in 018 |
| `intent` | One-line statement of what the command is for |
| `cli_verbs` | Zero or more existing CLI verbs this command invokes |
| `skill` | The bundled skill the wrapper loads |
| `wrapper_template` | Source path under `distribution/bundle-templates/` |
| `bundle_destination` | Output path inside the generated bundle |
| `mode` | `read-only` or `mutating`; 018 permits only `read-only` |
| `status` | `shipped`, `deferred`, or `internal` |

A `deferred` or `internal` entry must have no wrapper and no bundle file, which
lets the authority record a planned command (such as `auto`) without shipping it.

## The router skill

One `skills/aker-build/SKILL.md`, self-describing so an agent needs to know only
the plugin name. Authored against `skill-creator` guidance: the description
triggers on intent rather than on the product name, and the body explains why
each constraint exists rather than stacking imperatives.

Required content:

- **Prefer the machine contract over guessing.** Use `aker_build_next_task`
  (MCP) when wired, else `aker-build route --stdout --format json`. Guessing a
  verb produces an unrecoverable wrong answer; the contract returns one action or
  a named blocker.
- **Report derived scope as returned.** `allowed_files` / `forbidden_files` come
  from a scan of the architecture. Widening them discards the analysis that
  justified them.
- **Findings are advisory.** A clean `check` is necessary, not sufficient — it
  does not prove semantic correctness and grants no approval.
- **Never emit a readiness or confidence score.** The queue already carries a
  measured `confidence_tier`. A synthesized score is a fabricated number layered
  on measured ones, and readers cannot tell the two apart.
- **Never simulate output.** If `aker-build` is absent, say so and point to
  `npx aker-build check .`.

The skill also documents surface discovery, so no name needs memorizing:
`/aker-build:help` prints the installed command map, and `aker-build --help`
lists every CLI verb.

## Integrity

`bundle-manifest.json` mirrors the shape 017 already proves, one entry per
generated file:

```json
{
  "source": "distribution/bundle-templates/claude/commands/next.md",
  "source_sha256": "…",
  "destination": "commands/next.md",
  "output_sha256": "…",
  "transform": "copy-normalized-v1",
  "classification": "generated_wrapper"
}
```

Two transforms suffice: `copy-normalized-v1` (line-ending and trailing-newline
normalization) and `template-substitute-version-v1` (version injection into
`plugin.json`).

Reusing 017's idiom rather than inventing a parallel one keeps one answer to "is
this artifact the one we reviewed?" A hand-maintained `.claude/` tree cannot
answer that question at all, which is why it was rejected as an approach.

`bundle-manifest.json` is **committed**, while the files it describes are
git-ignored. This split is deliberate. Comparing two consecutive generator runs
proves only determinism within one process; it says nothing about whether the
current output matches what a reviewer approved. A committed manifest is that
baseline, so changing a template surfaces as a manifest diff in review rather than
as a silent regeneration. Spec 017 makes the same choice: `packages/cli/dist/npm/`
is generated, but `release-preflight.mjs` fails closed against committed
expectations.

## Testing

| Test | Proves |
|---|---|
| Contract reconciliation | YAML↔wrapper agree in both directions; schema valid; every `mode` is `read-only` |
| Generator determinism | Two consecutive runs produce byte-identical manifests |
| Baseline agreement | The regenerated manifest matches the committed `bundle-manifest.json` |
| Frontmatter validity | Every wrapper has a `description`; the skill has valid `name` + `description` |
| CLI verb existence | Every `cli_verbs` entry actually exists in `packages/cli/src/index.ts` |
| Skill eval | Subagent runs on real prompts; verifies the skill routes to the machine contract and does not invent scope or a score |

The CLI-verb-existence test is what makes the projection rule enforceable rather
than aspirational: if someone renames a CLI verb, the surface fails loudly
instead of silently advertising a verb that no longer exists.

The skill eval follows `skill-creator`'s loop — draft, run subagents with and
without the skill, review outputs, iterate. It belongs in implementation rather
than here because it requires a real SKILL.md to run against.

## Approaches considered

**A. Contract-generated bundle (chosen).** Highest upfront cost — a contract,
generator, and tests before the first slash command works — but the only option
where "the surface stayed read-only" is provable rather than reviewed, and the
only one that reuses the existing 016/017 integrity pipeline.

**B. Hand-maintained `.claude/` tree.** Fast, and legitimate as a throwaway
spike to test skill wording. Rejected as the deliverable: it loses the integrity
guarantee entirely and cannot answer whether a bundle matches what was reviewed.

**C. Generate wrappers from the CLI by introspection.** Rejected because it
conflates two surfaces that should differ. Not every verb should be a slash
command (`map` is a debugging re-emit), the surface needs commands with no verb
at all (`help` now, `auto` in 019), and auto-generation would ship a new command
whenever anyone added a CLI verb — the opposite of a reviewed surface.

## Out of scope

- Spec 019's `/auto` loop and governor tools (`explain_blockers`,
  `prepare_approval_request`, `export_evidence_pack`).
- Any mutation, enforcement, auto-fix, auto-commit, or auto-merge.
- Publishing the plugin to a marketplace. The bundle is built and verified; the
  first publish is owner-owned, consistent with the npm publish boundary.
- A Codex or other non-Claude agent surface. The schema carries `platform` to
  allow it later without a migration.

## Risks

| Risk | Mitigation |
|---|---|
| Bundle drifts from CLI as verbs evolve | CLI-verb-existence test fails the build |
| Skill under-triggers, so agents never load it | `skill-creator` description optimization during implementation |
| A future command ships as `mutating` by accident | CI asserts every `mode` is `read-only`; changing that needs a recorded decision |
| New top-level `distribution/` tree surprises contributors | `distribution/README.md` states the authority rule and generation flow |
