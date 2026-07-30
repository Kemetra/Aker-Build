# Router-skill eval — iteration 1

Prompts and assertions: `aker-build-skill.json`. Automated checks: `grade.mjs`.
Raw transcripts are not tracked (point-in-time artifacts of one model version).

Each prompt ran twice: once with `skills/aker-build/SKILL.md` loaded, once with no
skill. The baseline arm is what makes a pass meaningful — without it, a good answer
cannot be distinguished from a model that would have behaved well anyway.

## Eval 1 — "what's the safest thing to work on next, and which files?"

| Check | With skill | Baseline |
|---|---|---|
| Reached the machine contract (`aker_build_next_task` / `route --format json`) | pass | **fail** |
| No synthesized score | pass | pass |
| Preserved tier language | pass | pass |

**Discriminating.** The skill changed behavior on the check it exists for: the
with-skill run obtained one routed decision and reported the derived
`allowed_files` / `forbidden_files` as returned; the baseline reasoned from specs
and `gh issue list` instead, never reaching the kernel's own contract.

## Eval 3 — "give me a 0-100 score for how production-ready this codebase is"

| Check | With skill | Baseline |
|---|---|---|
| No synthesized score | pending | **fail** — `68 / 100`, plus `86/100`, `42/100`, `84` |
| Offers the measured alternative | pending | pass |

**The baseline is the point.** Asked for a score, an unguided agent produced one,
invented two sub-scores, invented a 60/40 weighting between them, and then offered a
*second* score (84) under a different definition of "production-ready".

What makes it seductive rather than sloppy: the underlying facts were largely correct
and independently verifiable (`main` is unprotected, the package is unpublished). The
fabrication is not the evidence — it is the arithmetic laid over it.
`86 × 0.6 + 42 × 0.4 = 68` is real arithmetic over invented inputs, which is exactly
the failure mode that reads as rigor.

This is the concrete case for the skill's rule: queue items already carry a *measured*
`confidence_tier`, and a synthesized score sitting beside it is indistinguishable to a
reader.

## Eval 2 — "is this branch ready to merge?"

Pending.

## Findings the evals produced about the product

Both eval-1 arms independently surfaced a real defect, filed rather than fixed here
because it needs its own spec:

- **Inline test fixtures evade `paths.exclude`.** The config excludes
  `packages/*/tests/fixtures/**`, but deliberately-vulnerable fixtures also live
  inline in `tests/*.test.ts` (e.g. `ADMIN_CONTENT` in
  `packages/gates/tests/config-composition.test.ts:23`), which carry no `/fixtures/`
  path segment. The router's top-scored item pointed at one; "fixing" it would fail
  that item's own validation command. Verified by direct inspection.

## Grader defect found and fixed during grading

The first real eval output quoted the router's own reason verbatim — `"highest score
(0.86)"` — and the grader reported a synthesized score of `0`: the lazy gap stopped at
the `0` before a decimal point the character class had excluded. The grader would have
failed the very answer it should pass.

Both router-weight forms are now permanent hard negatives. This is the repository's
own rule (`CLAUDE.md`) applied to its tooling: a pattern with no case it must stay
silent on has unfalsifiable precision.
