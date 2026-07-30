# Glob Wildcard-Prefix Fix Design (Spec 022)

**Date:** 2026-07-30
**Status:** Approved (design); implementation pending plan + tasks review
**Scope:** Fix `matchesPathPattern` so a `/**` pattern containing a wildcard matches. One function in `packages/config`.

## Problem

A `paths.exclude` pattern that combines a wildcard with a trailing `/**` silently
matches nothing:

```jsonc
{ "paths": { "exclude": ["packages/*/tests/**"] } }   // excludes zero files
```

No error, no warning. The user believes their scan is scoped and it is not — which
is worse than a rejected pattern, because a rejected pattern gets fixed.

### Root cause

`packages/config/src/index.ts:157-160`, a fast path that returns before
`globToRegex` is ever consulted:

```typescript
if (normalizedPattern.endsWith("/**")) {
  const prefix = normalizedPattern.slice(0, -3);   // "packages/*/tests"
  return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
}
```

`slice(0, -3)` yields the raw prefix `packages/*/tests`, and `startsWith` performs
no glob expansion. No real path begins with a literal `*`, so the predicate is
always false for any wildcard-bearing prefix.

**`globToRegex` is not the bug.** It compiles `packages/*/tests/**` to
`^packages\/[^/]*\/tests\/.*$`, which correctly matches both
`packages/gates/tests/a.test.ts` and `packages/gates/tests/fixtures/x.ts`. Verified
in isolation. The regex simply never runs.

### Why the fast path exists

It handles the case the regex cannot: a pattern like `benchmark/**` should also
match the bare directory `benchmark`, with no trailing slash. `globToRegex` emits
`^benchmark\/.*$`, which requires the slash. So the fast path is not redundant —
it encodes a real rule, and the fix must preserve it.

## Measured impact

Reproduced on merged `main` (`0559304`) via `aker check .`:

| | Findings |
|---|---|
| Committed config (two literal `fixtures/**` globs) | 38 |
| After replacing them with `packages/*/tests/**` | **50** |

The count rises because the wildcard pattern excludes nothing while the literal
patterns it replaced were working. That inversion is what exposed the bug.

## The fix

Keep the bare-directory rule, but only take the string fast path when the prefix
has no wildcard. Otherwise fall through to the regex, which already handles it:

```typescript
if (normalizedPattern.endsWith("/**")) {
  const prefix = normalizedPattern.slice(0, -3);
  if (!prefix.includes("*")) {
    // Literal prefix: also match the bare directory, which the regex cannot express.
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  // Wildcard prefix: the regex handles it; also allow the bare-directory form by
  // testing the prefix pattern itself.
  return (
    globToRegex(normalizedPattern).test(normalizedPath) ||
    globToRegex(prefix).test(normalizedPath)
  );
}
```

The second `globToRegex(prefix)` test preserves bare-directory matching for
wildcard patterns too, so `packages/*/tests/**` matches the directory
`packages/gates/tests` as well as its contents. Without it the two branches would
disagree about what `/**` means depending on whether a wildcard was present.

## Scope boundary

This fixes pattern *matching*. It deliberately does not:

- Change the default exclude set. Defaults affect every consumer's scan; this is a
  correctness fix, not a policy change.
- Change this repository's `aker-build.config.json`. That is a separate one-line
  change, valid only once this fix lands, and it is repository configuration rather
  than product behavior.
- Touch any detector. The three self-scan findings in detector *source* are regex
  literals matching themselves; no path pattern can address them, and a detector
  change requires its own spec and a new benchmark hard negative.

## Testing

`matchesPathPattern` has **no direct tests today**, and every existing
`isPathAllowed` exclude case uses a literal prefix (`apps/api/generated/**`). That
is precisely why this survived: the bug lives in the one shape nothing exercised.

| Test | Proves |
|---|---|
| Wildcard prefix matches contents | `packages/*/tests/**` matches `packages/gates/tests/a.test.ts` — the reported failure |
| Wildcard prefix matches nested contents | …and `packages/gates/tests/fixtures/x.ts` |
| Wildcard prefix matches the bare directory | …and `packages/gates/tests`, so both branches agree |
| Literal prefix still matches (regression) | `apps/api/generated/**` behaviour is unchanged |
| Literal bare directory still matches (regression) | `benchmark/**` matches `benchmark` — the rule the fast path exists for |
| **Hard negative:** wildcard must not over-match | `packages/*/tests/**` does **not** match `packages/gates/src/x.ts` or `packages/gates/testsuite/x.ts` |
| **Hard negative:** single `*` does not cross `/` | `packages/*/x.ts` does not match `packages/a/b/x.ts` |

The hard negatives carry the weight. A fix that made the pattern match *more* would
also "fix" the symptom while silently excluding real code from every scan — the
failure direction that matters, and the one a naive fix would take.

## Out of scope

- Adding `packages/*/tests/**` to this repo's config (follow-on, one line).
- The regex-literal detector exemption for the remaining 3 findings (own spec).
- Regenerating `docs/evidence/2026-07-30-self-scan.md`, which belongs with the
  config change that alters the numbers it records.

## Risks

| Risk | Mitigation |
|---|---|
| Fix over-matches and silently excludes real code | Three hard negatives, including the `testsuite` near-miss that a prefix-based fix would wrongly match |
| Bare-directory rule regresses for literal patterns | Explicit regression test for `benchmark/**` → `benchmark` |
| The two branches disagree on `/**` semantics | Wildcard branch also tests the prefix pattern, so bare-directory matching holds in both |
| Fix changes benchmark results | The eval harness reads no `aker-build.config.json` (only git config); baseline "All thresholds met" recorded before the change and re-run after |
