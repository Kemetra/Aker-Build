# Output Contract: compiled prompt structure

The shape of a compiled prompt (Markdown). This is the safety contract every renderer must satisfy.

---

## Required sections (in this fixed order — FR-001, SC-001)

```text
1. Objective
2. Repo-state verification
3. Context
4. Scope
5. Allowed files
6. Forbidden files
7. Validation commands
8. Git rules
9. Stop conditions
10. Final report format
```

Every compiled prompt MUST contain all ten, in this order, regardless of renderer.

## Invariant blocks (byte-identical across claude / codex / generic — FR-015, SC-005)

**Git rules** (always, verbatim):

```text
- Do not commit unless explicitly requested.
- Do not push unless explicitly requested.
- Do not open a PR unless explicitly requested.
- Stage named files only if staging is explicitly requested.
- Never use git add -A.
- Never use git add .
- Do not modify secrets, credentials, environment files, or generated lockfiles unless explicitly allowed.
```

**Stop conditions** (item `stop_conditions[]` PLUS these defaults, always):

```text
- Required files are missing.
- Scope requires migration but the task did not allow migrations.
- Public API shape must change but the contract update was not in scope.
- Auth or tenant model is unclear.
- Validation cannot run.
- Unrelated test failures appear.
```

**Final report format** (the constitution's required report):

```text
- Files changed
- Summary of changes
- Tests run and results
- Evidence used
- Risks or gaps
- Git status
- Next safe action
```

## Content rules

- **Allowed files / Forbidden files / Validation** are listed **explicitly** (FR-002); forbidden may be
  empty → "(none beyond the default git rules)".
- **Context** cites the item's `source.evidence`; **no secret value** is ever rendered (FR-007).
- The prompt is **narrow** — it instructs the agent to stay within `allowed_files` and never do broad
  refactors or whole-repo changes (FR-004).
- The prompt **never** instructs commit / push / merge / auto-execute (FR-008).
- Presentation (headings, framing preamble) may vary per renderer; **meaning does not**.
