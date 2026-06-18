# @tenantguard/scanner

Read-only repo scanner — the producer half of the 002↔003 pair. It reads a local Git repository and
produces a Project Map that **validates against `@tenantguard/project-map`**, plus run notes.

Spec: [`specs/003-cli-scanner`](../../specs/003-cli-scanner/spec.md)

## Usage

```ts
import { scan, scanToFile } from "@tenantguard/scanner";

const { map, notes } = scan("/path/to/repo");        // in-memory
const { outPath } = scanToFile("/path/to/repo", ".tenantguard"); // writes project-map.json
```

## Guarantees

- **Read-only** on the scanned repo — never creates/modifies/deletes a tracked file (FR-003). Output
  is written only to a designated dir outside tracked source.
- **002-conforming** — the assembled map is validated with `@tenantguard/project-map` before return;
  an invalid map is a scanner bug (throws), never emitted (R5).
- **Honest** — empty/`null`/`not_detected` + low-confidence when no evidence; never fabricates a
  stack, repos, tenant model, or surfaces (FR-004, FR-006). Emits an `insufficient_evidence` note.
- **Deterministic** — collections are stably sorted so re-scans are diff-friendly (FR-010).
- **Local-first** — no network, no credentials, no `git` shell-out (FR-011): pure `node:fs` reads.
- **No secrets** — secret-like content is flagged as a `flagged_secret` note (path + signal only);
  the value is never read into the map, notes, or output (FR-012).
- **Domain-neutral** — no Retail Tower / ERPNext / POS detection (FR-013).

## Develop

```bash
pnpm test
pnpm typecheck
```
