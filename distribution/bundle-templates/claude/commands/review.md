---
description: Review a local diff or PR for merge readiness against the gates
---

Load the `aker-build` skill. Run `aker review-pr --local-diff` (or against
the named PR) and report the verdict exactly as returned: Ready, Not Ready, or
Needs Verification. Needs Verification is a real verdict, not a soft pass — report
it as-is with the evidence behind it, and never upgrade it to Ready.
