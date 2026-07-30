---
description: Report the state of produced Aker Build artifacts as recorded
---

Load the `aker-build` skill. Run `aker-build report` if installed and report the
recorded artifact state exactly as returned. An empty queue is a truthful answer,
not an error. Never invent a finding, upgrade a `suspected` tier to confirmed, or
emit a numeric readiness or confidence score.
