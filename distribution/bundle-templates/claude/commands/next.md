---
description: Return the one next-safest task with its derived file scope
---

Load the `aker-build` skill. Obtain exactly one next action — prefer the MCP tool
`aker_build_next_task`, else `aker route --stdout --format json` — and report
the item with its derived `allowed_files` and `forbidden_files` exactly as
returned, plus the evidence that justified them. Never widen the scope. When there
is no safe task, report the named reasons and the blocked items rather than
choosing one anyway.
