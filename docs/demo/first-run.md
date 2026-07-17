# First-Run Demo

This demo proves the local MVP chain against a sanitized example repo. It does not require GitHub credentials and does not mutate the Aker Build repository.

## One Command

```bash
pwsh -File scripts/smoke-first-run.ps1
```

The script copies `examples/multi-tenant-saas-basic` to a temporary git repo, commits the baseline fixture, runs the CLI chain, creates a controlled local diff, and verifies that these files exist:

```text
project-map.json
risks.json
queue.json
route.json
prompt-Q-001.md
review.json
review.md
aker-build-report.json
aker-build-report.md
```

## Manual Flow

Use this shape when running against your own local git repo:

```bash
pnpm dlx tsx packages/cli/src/bin.ts scan <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts gates <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts queue <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts route <repo> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts prompt Q-001 --agent claude --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts review-pr <repo> --local-diff --base <ref> --out <out-dir>
pnpm dlx tsx packages/cli/src/bin.ts report <repo> --out <out-dir>
```

Expected value:

- `project-map.json` identifies the project shape and tenant marker.
- `risks.json` carries evidence-backed gate findings.
- `queue.json` turns findings into scoped work items.
- `route.json` selects the next safe task and explains why.
- `prompt-Q-001.md` gives an AI agent a bounded objective, allowed files, forbidden files, validation, git rules, stop conditions, and final report requirements.
- `review.json` and `review.md` compare the selected base (default `HEAD`) with the current working
  tree. They show introduced/worsened findings separately from existing debt and resolved findings;
  incomplete source or diff evidence is `needs_verification`, never a pass.
- `aker-build-report.json` and `aker-build-report.md` summarize the run artifacts, suppressions, config, and Spec Kit evidence.

## Boundaries

The demo is intentionally report-only. Aker Build does not execute agents, commit, push, open PRs, auto-fix, auto-merge, or require hosted infrastructure.

`--base` applies only to local-diff review. PR review resolves its exact GitHub base and head commit
SHAs and compares those two snapshots; the CI workflow fetches full history for that purpose.
