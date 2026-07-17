# 017 Verification Evidence

**Verified**: 2026-07-17
**Result**: Local implementation and owner-delegated external diff review passed
**Boundary**: Docker execution, hosted CI, public TLS, and registered-App live delivery remain pending

## Test-first evidence

RED failures were captured before each implementation slice: scanner budgets (six), repository
identity/workspace containment, intake/queue ordering, retry/check lifecycle, worker timeout/crash
IPC, runtime configuration/HTTP/observability, and artifact contracts. The final review added three
further RED regressions for executable ESM artifacts, drain-timer cleanup, and synchronous worker
spawn failure; each failed for the intended reason before its focused fix passed.

## Local verification

| Command or proof | Result |
|---|---|
| `pnpm --filter @aker-build/github-app-server test` | 125 passed; 3 credential-gated live tests skipped |
| `pnpm test` | 460 passed; 3 credential-gated live tests skipped |
| `pnpm typecheck` | Passed across all 13 tested workspace projects |
| `pnpm --filter @aker-build/github-app-server build` | Built `dist/server.mjs` and `dist/worker-entry.mjs` |
| Compiled worker execution test | Passed with validated fixed `worker_failed` IPC result |
| Compiled server loopback `/healthz` smoke | Passed |
| `pwsh -File scripts/smoke-first-run.ps1 -RemoveTemp` | Passed end to end; temporary project removed |
| `pnpm audit --prod` | No known vulnerabilities found |
| Static secret/mutation/publication scan | No credential literal, mutation API, or `docker push` path found |
| `git diff --check` | Passed |

The two-overlapping-dispatch regression closes 015 T021a: both events enter separate workspaces,
each preparation callback reads only its own identity, both checks are posted, and both roots are
disposed. Real local Git tests continue to prove fetch/checkout and non-persistence of auth config.

## Artifact and supply boundary

- `esbuild` `0.28.1` is a direct exact dev dependency; its importer and platform packages are the
  only intentional lockfile addition.
- The two-stage Dockerfile uses the reviewed Node 24 Alpine digest, copies only compiled artifacts
  into the final stage, runs as `node`, declares the temp volume and health check, and has no publish
  command. The compose example uses a read-only root, dropped capabilities, `no-new-privileges`, a
  dedicated temp volume, and host-loopback publication.
- Docker could not be executed on this host: `Get-Command docker` returned
  `DOCKER_UNAVAILABLE`. T031 therefore remains unchecked rather than recorded as a pass.

## External rejection result

All local rejection conditions in the reviewed plan passed after the corrections recorded in
`external-review.md`. Report-only Checks create/update remains the only write surface. Scanner budget
errors are fixed closed reasons and the CLI remains unbounded. Source, raw body, signature, and
credentials never cross worker IPC. Cleanup requires tracked resolved containment plus a matching
random marker nonce.

## Official behavior references

- GitHub webhook delivery guidance: <https://docs.github.com/en/webhooks/using-webhooks/handling-webhook-deliveries>
- GitHub webhook delivery GUID/redelivery guidance: <https://docs.github.com/en/webhooks/using-webhooks/best-practices-for-using-webhooks>
- GitHub Checks lifecycle API: <https://docs.github.com/en/rest/checks/runs>

## Hosted/manual handoff still pending

1. Obtain the first successful hosted quality, security/CodeQL, and container-build jobs.
2. Build and smoke the container on a Docker-capable host with a read-only root and dedicated volume.
3. Deploy behind operator-owned TLS termination and verify readiness, shutdown, cleanup, and alerts.
4. Run the credential-gated live smoke plus signed public webhook/redelivery checklist against a
   registered App and test repository.

Until those records exist, describe 017 as locally complete and externally reviewed—not operationally
proven on a public host.
