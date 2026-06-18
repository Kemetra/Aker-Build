# Phase 1 Data Model: PR Reviewer

The review entities, the **finding-attribution rule**, the **status-based verdict rule**, the scope
check, and the `review.json` shape. Grounded in the **real shipped types**: `Finding`/`RiskList` from
`@tenantguard/gates` (`packages/gates/src/types.ts`), `QueueItem` from `@tenantguard/queue`
(`packages/queue/src/types.ts`), and the 002 `Evidence` shape. No code is created here.

---

## Inputs (verbatim upstream shapes)

```text
Finding (004) =
  | { gate_id, status: "risk",               severity: Severity, evidence: Evidence[] }
  | { gate_id, status: "needs_verification", severity: null,     evidence: Evidence[] }
  | { gate_id, status: "not_applicable",     severity: null,     evidence: Evidence[] }
Evidence (002) = { type, path, line?, signal, confidence }     // `path` is the diff-attribution key
RiskList (004) = { schema_version, findings: Finding[] }
QueueItem (005) = { id, title, ..., allowed_files: string[], forbidden_files: string[], ... }
```

**There is no "blocking gate" field** on a `Finding` (only `status` + `severity`). The verdict is
derived off `status`. **Evidence `path` is the only per-finding location** 004 exposes — it is the join
key for diff attribution.

---

## Changed Files (the join set)

```text
ChangedFiles = string[]   // repo-relative POSIX paths the diff touches
```

- **Local diff** (R1): `git diff --name-only HEAD` (+ staged + untracked), normalized to repo-relative
  POSIX, de-duplicated, sorted by code-unit comparison.
- **PR** (R5): the PR's changed files via the user's `gh` CLI, same normalization.

---

## Finding attribution (the core rule, R2)

A 004 finding is **diff-attributable** iff **any** of its `evidence[].path` is in `ChangedFiles`:

```text
attributable(f, changed) = f.evidence.some(e => changed.includes(e.path))
```

Only diff-attributable findings drive the verdict and appear in the report's contributing findings.
Findings whose evidence touches no changed file are **out of the diff's scope** and are dropped from the
verdict (they may be summarized as "pre-existing, not introduced by this diff" — informational only).
004 is consumed **verbatim**; attribution happens entirely in `packages/review`.

---

## Scope check (optional `--item`, R4)

When `--item <ID>` is supplied, load the `QueueItem` by `id` from `queue.json` and compare each changed
file:

```text
out_of_scope(file, item) =
     item.forbidden_files.includes(file)
  OR (item.allowed_files.length > 0 AND NOT item.allowed_files.includes(file))
```

(`allowed_files` empty = "no allow-list constraint" — only `forbidden_files` applies, mirroring 006's
forbidden-empty handling.) Any out-of-scope changed file is a scope violation contributing to the
verdict. **Without `--item`**, the scope check is **skipped** and `scope.checked = false` is recorded in
the report (FR-003). Missing `queue.json` (with `--item`) → "run `tenantguard queue` first"; unknown
`<ID>` → clear error.

---

## Verdict rule (status-based, R3 / FR-012)

```text
if  (any diff-attributable finding has status "risk")  OR  (any scope violation)   → "not_ready"
elif (any diff-attributable finding has status "needs_verification")               → "needs_verification"
else                                                                               → "ready"
```

All `risk` findings block in v0; `severity` is reporting detail only. A **single review of current
state** suffices (no before/after scan). Determinism: findings + changed files sorted by **code-unit**
comparison (not `localeCompare`) — the 004 lesson carried verbatim.

---

## Entities

- **ReviewMode**: `"local-diff" | "pr"`.
- **Verdict**: `"ready" | "not_ready" | "needs_verification"`.
- **ReviewFinding**: a contributing finding = `{ gate_id, status, severity, evidence: Evidence[] }`
  (a diff-attributable 004 `Finding`, surfaced as-is) **or** a scope violation
  = `{ kind: "scope", file, reason: "forbidden" | "outside_allowed", item_id }`.
- **ScopeResult**: `{ checked: boolean, item_id?: string, violations: ScopeViolation[] }`
  (`checked: false` when no `--item`).
- **ReviewReport** (→ `review.json`): `{ schema_version, mode, verdict, changed_files: string[],
  findings: ReviewFinding[], scope: ScopeResult, github_available?: boolean }`.
- **GitHubUnavailable**: PR mode only — `{ github_available: false }` + a clear message; exits non-zero
  but never blocks local-diff (FR-006).

---

## `review.json` (machine-readable, Zod-validated — R6)

```jsonc
{
  "schema_version": 1,
  "mode": "local-diff",
  "verdict": "not_ready",
  "changed_files": ["apps/api/routes/admin.ts"],
  "findings": [
    { "gate_id": "TG-G4", "status": "risk", "severity": "high",
      "evidence": [{ "type": "...", "path": "apps/api/routes/admin.ts", "line": 12,
                     "signal": "admin route without role guard", "confidence": "high" }] }
  ],
  "scope": { "checked": true, "item_id": "Q-001", "violations": [] },
  "github_available": null
}
```

Validated by `validateReview` against the 007 Zod schema before write. The Markdown report renders the
same verdict + findings + scope for humans (FR-013). Secret-like evidence is flagged by `signal` name
only — never the raw value (FR-009, inherited from upstream).

## Determinism

For the same input (repo state + diff + optional item), output is byte-identical (fixed section order;
code-unit-sorted findings/files; no clock/random/locale) (FR-010, SC-007).
