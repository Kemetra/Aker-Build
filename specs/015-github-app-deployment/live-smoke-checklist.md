# Live Smoke Test — Field Verification Checklist (015)

The automated suite proves the App is correctly **assembled** and **secret-safe**, but it never calls
api.github.com. This checklist closes that gap: it confirms the App can actually **mint a token**,
**read a PR's files**, and **write a check** against a registered GitHub App. Run it once after
deploying / before trusting "runs live."

The smoke test (`packages/github-app-server/tests/live-smoke.test.ts`) drives the App's **real
composition root** (`composeDeps`) — the same code the server runs — so a green result certifies *your
wiring*, not a re-implementation.

---

## Three verification paths (what proves what)

| # | Path | What it proves | Who runs it | Status |
|---|------|----------------|-------------|--------|
| 1 | **Adapter smoke test** (this checklist, Step 1) | token mint + read pagination + check write against api.github.com | operator, via `! <command>` with creds | **runnable now** |
| 2 | **Full host / webhook run** (Step "full server" below) | HMAC signature verification + ephemeral checkout + dispose, end-to-end on a real PR | operator, behind a public endpoint | **runnable** — host entrypoint now exists (needs a TS runtime in dev; see note) |
| 3 | **Remains manual / operator-owned** | branch-protection making the check *required* (P6, out of scope); multi-tenant/serverless hosting (out of scope) | repo owner / future work | **not part of 015** |

Path 1 is the prerequisite first proof. Path 2 certifies the parts Path 1 cannot (signature + git
checkout). Path 3 is explicitly out of this feature's scope.

---

## You will need

- A **registered GitHub App** with the 014 permission set: `checks: write`, `contents: read`,
  `metadata: read`; webhook subscribed to `pull_request`.
- The App **installed** on a target repo you control.
- The App's **id**, **private key (.pem)**, **webhook secret**, and the **installation id** for that repo.
- An **existing open PR** on the installed repo, and that PR's **head commit SHA**.
  - Find the installation id: GitHub → App settings → Install App → the number in the install URL.
  - Find the head SHA: `git rev-parse HEAD` on the PR branch, or the PR's "Commits" tab.

> **Secrets stay in your hands.** Provide all credentials via environment variables in a `! <command>`
> you run yourself. They are never written to disk, never logged, never committed. The private key is
> held only in memory by octokit's auth strategy (Principle VII).

---

## Step 1 — Run the smoke test (Bash / Git Bash)

From the repo root, run (substitute your real values; the `.pem` is read inline, never stored):

```bash
TENANTGUARD_SMOKE=1 \
TENANTGUARD_APP_ID="<app id>" \
TENANTGUARD_APP_PRIVATE_KEY="$(cat /path/to/your-app.private-key.pem)" \
TENANTGUARD_WEBHOOK_SECRET="<webhook secret>" \
TENANTGUARD_INSTALLATION_ID="<installation id>" \
TG_SMOKE_OWNER="<repo owner / org login>" \
TG_SMOKE_REPO="<repo name>" \
TG_SMOKE_PR="<existing PR number>" \
TG_SMOKE_HEAD_SHA="<that PR's head commit sha>" \
pnpm --filter @tenantguard/github-app-server exec vitest run live-smoke
```

PowerShell equivalent (set then run, in one session so the vars persist):

```powershell
$env:TENANTGUARD_SMOKE="1"
$env:TENANTGUARD_APP_ID="<app id>"
$env:TENANTGUARD_APP_PRIVATE_KEY=(Get-Content -Raw C:\path\to\your-app.private-key.pem)
$env:TENANTGUARD_WEBHOOK_SECRET="<webhook secret>"
$env:TENANTGUARD_INSTALLATION_ID="<installation id>"
$env:TG_SMOKE_OWNER="<repo owner / org login>"
$env:TG_SMOKE_REPO="<repo name>"
$env:TG_SMOKE_PR="<existing PR number>"
$env:TG_SMOKE_HEAD_SHA="<that PR's head commit sha>"
pnpm --filter @tenantguard/github-app-server exec vitest run live-smoke
# Clear them afterwards: Remove-Item Env:TENANTGUARD_*, Env:TG_SMOKE_*
```

---

## Step 2 — Read the result

**Expected on success:** `3 passed`. Each passing test certifies one real path:

- [ ] **Token mint** — `appId/privateKey/installationId` → a real installation access token.
- [ ] **Read pagination** — `pulls.listFiles` through `octokit.paginate` against real Link headers
      (the truncation risk that would otherwise mark a large PR falsely "clean").
- [ ] **Check write** — `checks.create` through the `createAppAuth`-authed Octokit returns a real
      check id. (A successful create also implicitly proves the App-JWT → installation-token exchange.)

- [ ] **Confirm in the GitHub UI:** open the PR's head commit — a **neutral** check named
      **`TenantGuard`** ("TenantGuard live smoke") should now be present. This is the human-eye proof
      that the write actually landed on GitHub.

**If it shows `3 skipped`:** `TENANTGUARD_SMOKE=1` was not set — the test never ran. Set it and retry.

**If a test fails:** the failure message names the failing path without printing any secret. Common causes:
- `401 / Bad credentials` → wrong app id, key, or installation id.
- `404` on listFiles/create → owner/repo/PR/SHA mismatch, or the App isn't installed on that repo.
- `403 Resource not accessible by integration` → the App is missing `checks: write` or `pull_requests/contents: read`.

---

## What green certifies — and what it does NOT

**Certifies (adapter layer, via the real composition root):**
token mint + read pagination + check write against **api.github.com**. This closes the
`octokit as unknown as OctokitLike` cast gap — real param names, real Link-header pagination, real
response shapes are all exercised.

**Does NOT certify (still manual — the fuller end-to-end flow):**
- **HMAC webhook signature verification** — that a real GitHub-signed delivery is accepted and a
  forged one is rejected (401).
- **The ephemeral git checkout + dispose** — clone the PR head, scan it, post the verdict, delete the dir.

To certify those, run the **full server** (path 2) end-to-end behind a public webhook. The host
entrypoint is `packages/github-app-server/src/bin.ts` (a thin shim that calls the exported `start()`,
which env-composes the runtime and binds the listener). It is registered as the package `bin`
`tenantguard-app-server`.

1. Set the four `TENANTGUARD_*` credentials (no `TG_SMOKE_*` needed) — environment only, never a file.
2. Launch the host. The bin uses `.js`→`.ts` import specifiers (same convention as the `tenantguard`
   and `tenantguard-benchmark` bins), so it needs a **TS-aware runtime**:
   - **Built / published package:** run the installed `tenantguard-app-server` command.
   - **In-repo dev run:** invoke `src/bin.ts` through a TS runtime (a build step, or a `tsx`/loader —
     `tsx` is intentionally **not** a repo dependency, so installing one is an operator/deploy choice,
     not a committed lockfile change). Example with a locally available loader:
     `node --import tsx packages/github-app-server/src/bin.ts`
3. Expose the port publicly (e.g. a tunnel) and point the App's **webhook URL** at it.
4. **Open a PR** on the installed repo.
5. Confirm a **`TenantGuard`** check appears at the PR head with the expected conclusion
   (`failure` for a confirmed finding in a changed file, `success` for clean, `neutral` for draft or
   could-not-complete).

> **TS-runtime caveat (honest):** the entrypoint now **exists and is wired** (proven by
> `tests/bin.test.ts` — the shim calls `start()` once — and `tests/start-server.test.ts` — `start()`
> boots a real socket). What it does **not** have is a zero-dependency `node`-only launch: like the
> rest of this TS-source monorepo it requires a build or a TS loader to run. Choosing that runtime is a
> deployment decision, deliberately left to the operator so this slice adds no lockfile change.

Until path 2 is actually run on a live PR, treat HMAC verification and the ephemeral checkout as
built-and-wired but **not field-verified**. The adapter smoke (path 1, Step 1) is runnable now and is
the prerequisite first proof.
