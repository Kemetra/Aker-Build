# Rename Guard Nested-Checkout Fix Design (Spec 023)

**Problem:** `pnpm test:agent-bundle` fails on any machine that has a nested git
worktree inside the repository. The rename guard walks the filesystem and reports
232 hits across 62 files, all inside `.claude/worktrees/`, none anywhere else.

**Scope:** `scripts/rename-guard.mjs` and its test. No product code, no detector
pattern change.

## What actually happens

`walk()` in `scripts/rename-guard.mjs` recurses the working tree, skipping directory
basenames listed in `SKIP_DIRS` (`node_modules`, `.git`, `dist`, `coverage`,
`.aker-build`). A linked git worktree is an ordinary-looking directory carrying a
`.git` **file** rather than a directory:

```text
.claude/worktrees/tool-incredible-unique-ea8064/.git
  -> gitdir: C:/Users/user/.../.git/worktrees/tool-incredible-unique-ea8064
```

So the guard descends into it and reads a *different commit's* files. Older commits
legitimately still invoke the retired `aker-build <verb>` command — that is what the
rename retired. The guard is correct about the text it found and wrong about whose
text it is.

The directory is excluded from git via `.git/info/exclude`, so git never shows it.
The guard consults its own `SKIP_DIRS`, not gitignore, so the two disagree about
what belongs to this project.

**Why CI is green:** a fresh Actions checkout has no nested worktree. The failure is
local-only, which is worse than a failure both see — it trains contributors to treat
a red guard as noise.

Verified: the guard fails identically on `main` and on a feature branch, so this
predates any current work.

## Rejected: name-based exclusion

The obvious fix is to add the directory name to `SKIP_DIRS`. Both spellings are wrong.

`"claude"` matches basenames anywhere in the tree, so it would also skip
`distribution/bundle-templates/claude/` — the live agent command templates. The
existing tests assert those files are neither historical nor self-referential,
i.e. that the guard **must** check them. Silencing them is exactly the over-broad
exemption `SELF_REFERENTIAL`'s comment warns about: it would make the guard pass
while real misses remain.

`".claude"` spares that directory but still overshoots: **9 tracked files** live under
`.claude/skills/`. Excluding committed content to suppress a problem caused by
untracked content trades a false positive for a blind spot.

Both spellings also fail to generalize. Worktrees are not required to live under
`.claude/`; `.worktrees/` is a common convention, and a stray clone in the tree
produces the same false positives under any name.

## Decision

Skip directories that carry their own `.git` entry.

```js
function isNestedCheckout(dir) {
  return existsSync(join(dir, ".git"));
}
```

A directory holding `.git` is a separate checkout — a linked worktree, a submodule,
or a clone — and its files belong to some other commit. This is the boundary git
itself draws; the guard walks the filesystem, so it has to draw the boundary
explicitly.

Properties:

| | Before | After |
|---|---|---|
| `.claude/worktrees/*` (other commits) | scanned, 232 false hits | skipped |
| `.claude/skills/*` (9 tracked files) | scanned | scanned |
| `distribution/bundle-templates/claude/` | scanned | scanned |
| `.worktrees/`, stray clones | scanned | skipped |
| Ordinary directory named `claude` | scanned | scanned |

The repository root is never tested: `walk()` checks child directories, and the
root's own `.git` is already in `SKIP_DIRS`.

`countScopeRefs` shares `walk()`, so its pinned count is affected in principle. In
practice it filters to paths starting with `packages`/`scripts`, and a nested
worktree's files are reached as `.claude/worktrees/.../packages/...`, which does not
match. The pinned 195 is expected to hold, and the existing test proves it.

## Testing

Per the detector rule in `CLAUDE.md`, narrowing what a detector sees requires proof
that the narrowing is not over-broad. Three new cases, all built as temp fixtures:

| Case | Asserts |
|---|---|
| Nested checkout carrying `.git` and a retired invocation | skipped — the fix works |
| Ordinary directory **named `claude`** with a retired invocation | still caught — the near-miss that makes the name-based fix unsafe |
| Directory containing `.gitignore` but no `.git` | still scanned — the match is exact, not a prefix |

The existing "still catches a retired invocation in an ordinary file" case stays as
the standing hard negative against over-broad exemption.

## Risks

| Risk | Mitigation |
|---|---|
| A submodule holding genuine live content would now be skipped | The repo has no submodules; `git submodule status` is empty. A submodule is a different project's code and does not belong to this rename anyway. |
| `existsSync` per directory adds stat calls | One extra stat per directory on a tree already read entry-by-entry; the guard runs in well under a second. |
| Fix hides a real miss inside a worktree | A worktree is a checkout of a commit that is either already reviewed or under review on its own branch, where the guard runs against it as the root. |

## Out of scope

Making the guard consult `.gitignore` rather than a hand-maintained `SKIP_DIRS`.
That is the deeper fix and a larger change; the two lists would still need
reconciling for `dist/` and `coverage/`, which are ignored for different reasons.
Recorded here as the known remaining divergence.
