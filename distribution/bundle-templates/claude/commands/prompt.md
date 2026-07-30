---
description: Compile the safe, scoped agent prompt for one queue item
---

Load the `aker-build` skill. Compile the prompt for the queue item id the user
named (for example `/aker-build:prompt Q-001`), preferring the MCP tool
`aker_build_compile_prompt`, else `aker-build prompt <id>`. Return the compiled
prompt as-is: it already carries the objective, allowed and forbidden files,
validation commands, git rules, stop conditions, and the required final-report
shape. If the compiler refuses because scope information is missing, report that
refusal — it is a real signal about the item, not an error to work around.
