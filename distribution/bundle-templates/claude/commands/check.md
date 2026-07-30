---
description: Run the read-only Aker Build chain and interpret its findings
---

Load the `aker-build` skill. Run `aker check .` if installed — one read-only
pass of scan → gates → queue → route → report — and interpret its output as
advisory evidence. A clean check is necessary but not sufficient: it does not prove
semantic correctness and grants no approval. Report `suspected` findings as
suspected, and never emit a readiness or confidence score.
