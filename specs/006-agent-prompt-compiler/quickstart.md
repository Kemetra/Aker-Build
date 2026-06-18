# Quickstart: Agent Prompt Compiler

Planned usage of `tenantguard prompt` once implemented (after plan + tasks review). Illustrative —
**no code exists yet**.

---

## Full pipeline → safe prompt

```bash
tenantguard scan        # → .tenantguard/project-map.json   (003)
tenantguard gates       # → .tenantguard/risks.json         (004)
tenantguard queue       # → .tenantguard/queue.json         (005)
tenantguard route       # → picks the next item, e.g. Q-001 (005)
tenantguard prompt Q-001 --agent claude   # → .tenantguard/prompt-Q-001.md + printed
```

## Variants

```bash
tenantguard prompt Q-001 --agent codex     # codex presentation, same safety
tenantguard prompt Q-001                    # generic agent
tenantguard prompt Q-001 --stdout           # print only, no file
```

Example (abbreviated) output:

```markdown
# Objective
Fix: admin route without a role guard

## Repo-state verification
Run `git status`; confirm the working tree matches expectations before any change.

## Allowed files
- apps/api/routes/admin.ts

## Forbidden files
(none beyond the default git rules)

## Git rules
- Do not commit unless explicitly requested.
- Never use git add -A.
...
```

---

## Acceptance mapping (spec → planned verification)

| Spec criterion | Planned test |
|----------------|--------------|
| SC-001 all required sections present | `required-sections.test.ts` |
| SC-002 explicit allowed/forbidden files | `explicit-files.test.ts` |
| SC-003 default git rules + stop conditions present | `default-blocks.test.ts` |
| SC-004 no secrets; no commit/push/merge | `no-secrets-no-mutation.test.ts` |
| SC-005 identical safety across renderers | `renderer-parity.test.ts` |
| SC-006 missing scope → refusal | `missing-scope-refusal.test.ts` |
| forbidden_files:[] still compiles (real-005 regression) | `forbidden-empty-ok.test.ts` |
| FR-010 unknown agent → generic + note | `unknown-agent-fallback.test.ts` |
| SC-008 deterministic | `determinism.test.ts` |
| CLI contract (exit codes, run-queue-first, ids) | `cli.prompt.test.ts` |

---

## Guarantees

- All required sections · explicit files · invariant git rules + stop conditions · no secrets ·
  no commit/push/merge · identical safety across renderers · refuse on missing scope · deterministic ·
  read-only · local-first · domain-neutral.
