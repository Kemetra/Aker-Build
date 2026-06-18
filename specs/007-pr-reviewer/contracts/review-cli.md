# Contract: `tenantguard review-pr` CLI

The command surface for the PR reviewer. Mirrors the established `run*Command(): number` pattern (scan/
gates/queue/route/prompt): testable, no `process.exit`, exit codes + injectable `sink`/`errSink`.

## Invocation

```text
tenantguard review-pr --local-diff                 review the current local diff (no credentials)
tenantguard review-pr --local-diff --item Q-001     ...and check scope against queue item Q-001
tenantguard review-pr <number>                      review a GitHub PR by number (uses the user's gh CLI)
tenantguard review-pr <number> --item Q-001         ...with scope checked against Q-001
```

## Options

| Option | Meaning | Default |
|--------|---------|---------|
| `--local-diff` | Review the working-tree diff (P1). Mutually exclusive with `<number>`. | — |
| `<number>` | Review GitHub PR #`<number>` (P2, additive). | — |
| `--item <ID>` | **Optional.** Check changed files against this queue item's scope (read from `queue.json`). Omitted → scope skipped + noted. | none |
| `--out <dir>` | Out-dir for `queue.json` input and `review.json`/`review.md` output. | `.tenantguard` |
| `--stdout` | Print the report only; do not write files. | off |
| `--format json\|yaml` | Machine-output format when printing. | `json` |

Exactly one of `--local-diff` / `<number>` MUST be given (else bad input).

## Behavior

1. Resolve **changed files** — local: read-only `git diff --name-only`; PR: the user's `gh` CLI
   (`gh pr view <n> --json files`).
2. Run the **full 004 gate set** over the **current working tree** (`@tenantguard/gates.runGates`),
   then **keep findings whose evidence `path` ∈ changed files** (diff-attribution).
3. If `--item`, load the item from `queue.json` and compute scope violations; else skip + note.
4. Derive the **verdict** off `status` (risk/out-of-scope → Not Ready; else needs_verification → Needs
   Verification; else Ready).
5. Emit `review.json` + Markdown (printed; written to out-dir unless `--stdout`). In PR mode the report
   also carries the PR's metadata (`pr`: number/title/state/base) as evidence (FR-005).

**v0 PR-mode assumption (important):** the gates inspect the **local working tree**, while the PR's
changed-files SET comes from GitHub. So the PR branch **must be checked out locally** for findings to
attribute correctly. If it isn't, files named by the PR won't exist locally, no findings will attribute,
and the verdict could be a false "Ready". Reviewing a PR's fetched diff directly (without a local
checkout) is a later, additive capability. The reviewer's own out-dir is always excluded from the
changed files (so it never reviews its own output).

## Exit codes

| Code | Meaning |
|------|---------|
| `0` | Review completed; a verdict was produced (Ready / Not Ready / Needs Verification). |
| `1` | Required upstream input missing — no `project-map.json` (run `tenantguard scan`), or `--item` given but no `queue.json` (run `tenantguard queue`). |
| `2` | Bad input — not a Git repo, both/neither of `--local-diff`/`<number>`, unknown `--item` id, or (PR mode) **GitHub access unavailable** (gap reported; local-diff remains available, FR-006). |
| `3` | Internal error — produced `review.json` failed its own schema (a reviewer bug; nothing written). |

The **verdict is independent of the exit code**: a Not-Ready verdict is still a *successful* review
(exit `0`). Exit `≠0` means the review could not be performed, not that the change is unsafe. (008 will
read the verdict from `review.json`, not the process exit code.)

## Guarantees

Read-only (FR-008/SC-006) · no secrets echoed (FR-009/SC-007) · deterministic for unchanged input
(FR-010/SC-007) · local-diff needs no network/credentials (FR-004/SC-005) · domain-neutral (FR-011).
