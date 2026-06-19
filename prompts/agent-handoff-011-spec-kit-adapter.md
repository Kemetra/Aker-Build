# Agent Handoff: 011 Spec Kit Adapter and Config Boundary

Use this only after 011 spec, plan, and tasks are reviewed.

```text
You are working in the TenantGuard repository.

Objective:
Implement only the approved 011 slice for a read-only Spec Kit adapter and safe TenantGuard config boundary. Keep TenantGuard Spec Kit compatible, not Spec Kit dependent.

First, verify repo state:
- Run: git status --short
- Confirm current branch.
- Read:
  - CLAUDE.md
  - .specify/memory/constitution.md
  - specs/011-spec-kit-adapter-and-config-boundary/spec.md
  - specs/011-spec-kit-adapter-and-config-boundary/plan.md
  - specs/011-spec-kit-adapter-and-config-boundary/tasks.md
- Stop if unrelated uncommitted changes exist.

Context:
TenantGuard must read Spec Kit artifacts when present and still work when they are absent. Config suppressions must be explicit, owned, reasoned, and visible in reports. The adapter is read-only.

Allowed files:
Use only files explicitly listed by the reviewed 011 tasks. Expected areas may include:
- contracts/tenantguard-config.schema.json
- packages/config/**
- packages/spec-kit-adapter/**
- narrowly scoped integration points in project-map/gates/queue/prompt/reporters/cli
- tests for the above

Forbidden files:
- Hosted dashboard code
- GitHub App code
- Auto-fix / auto-commit / auto-merge
- OPA/Rego engine unless a later ADR approves it
- Remote policy registry
- Secret/env files
- Broad refactors unrelated to 011

Validation:
- pnpm test
- pnpm typecheck
- Focused tests for config validation, missing Spec Kit artifacts, Spec Kit context enrichment, visible suppressions, and secret redaction/flagging behavior.

Git rules:
- Do not commit unless explicitly requested.
- Do not push unless explicitly requested.
- Do not open a PR unless explicitly requested.
- Stage named files only if staging is explicitly requested.
- Never use git add -A.
- Never use git add .

Stop conditions:
- The implementation requires mutating Spec Kit files.
- The implementation makes Spec Kit required for all repos.
- Suppressions become hidden instead of visible.
- Secret-like values would be printed in outputs.
- The scope requires a breaking output-contract change without ADR approval.

Final report:
Return:
- Files changed
- Summary of changes
- Tests run and results
- Evidence used
- Risks/gaps
- Git status
- Next safe action
```
