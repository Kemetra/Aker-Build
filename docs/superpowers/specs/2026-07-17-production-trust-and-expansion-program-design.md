# Aker Build Production Trust and Expansion Program

Status: Program approved; 016 and 017 implemented and externally reviewed locally 2026-07-17; hosted handoff pending
Date: 2026-07-17
Scope: Post-015 fortification, distribution, developer experience, and read-only agent integration

## Executive decision

Aker Build will complete a six-spec program before considering the hosted organization
dashboard (P5) or merge enforcement (P6):

```text
016 Source Truth & CI Baseline
  -> 017 GitHub App Runtime Fortification
  -> 018 Diff-Aware PR Review
  -> 019 Detection Coverage & Benchmark Hardening
  -> 020 Distribution & Developer Experience
  -> 021 Agent-Native MCP Surface
```

The sequence is a trust chain. The repository must first tell the truth about what is
shipped. The network runtime must then be safe under real traffic. PR attribution and
detection coverage must become trustworthy before the product is packaged and promoted.
Only after the public CLI contracts are stable should an MCP adapter expose them to agents.

Each numbered slice receives its own `spec.md`, `plan.md`, and `tasks.md`, is reviewed and
approved independently, and ends in working, testable software. No production implementation
for a slice begins before those three artifacts are approved.

## Why one large feature was rejected

Three delivery shapes were considered:

1. **Six independent specs (selected).** Strong review boundaries, explicit dependencies,
   and a usable checkpoint after every slice. It has more documentation but matches the
   product's own control model.
2. **One umbrella spec with six implementation plans.** Less document overhead, but runtime
   security, output-contract changes, packaging, and MCP concerns would share one approval
   boundary and make scope failures difficult to isolate.
3. **Launch-only subset followed by an unstructured backlog.** Fastest path to npm, but it
   would publish before diff attribution, coverage honesty, and runtime behavior are strong
   enough to support the product's trust claims.

The selected design implements all approved recommendations while preserving small,
reviewable change sets.

## Program-wide invariants

Every slice must preserve these rules:

- The CLI remains the canonical product interface.
- Findings remain deterministic, evidence-backed, and schema-validated.
- No feature executes an AI agent, auto-fixes code, commits, pushes, merges, or changes
  branch protection.
- The GitHub App's only GitHub writes remain `checks.create` and `checks.update`.
- Secrets and source contents never appear in public errors, logs, prompts, reports, metrics,
  or persisted hosted storage.
- Repository-derived strings are untrusted input. They are validated, bounded, and clearly
  delimited before being included in an agent prompt.
- P5 organization aggregation/dashboard and P6 merge enforcement remain deferred and are
  not authorized by this program.
- No Retail Tower, ERPNext, or other private-domain logic enters the product or benchmark.
- Lockfile changes occur only in the specific approved slice that changes packages.
- Every JSON contract change declares compatibility behavior and updates its canonical schema,
  producer tests, and consumer tests together.
- Tests that create Git repositories isolate themselves from global Git configuration.
- All filesystem cleanup validates ownership and containment before recursive removal.

## Program flow

```text
repository truth + green CI
  -> bounded and observable webhook intake
  -> base/head scans + changed-line attribution
  -> framework coverage declaration + statistically meaningful evaluation
  -> compiled npm CLI + report-only Action + onboarding commands
  -> local stdio MCP adapter over the stabilized public engine
```

## 016 — Source Truth & CI Baseline

### Goal

Make Aker Build's own repository an accurate, continuously verified example of the discipline
the product sells.

### Scope

016 is primarily reconciliation and verification. It does not change detector judgment,
review verdict semantics, or GitHub App runtime behavior.

### Components

1. **Artifact reconciliation**
   - Reconcile README, package READMEs, CLAUDE guidance, 014/015 spec status, plan status,
     task completion, quickstarts, and live-smoke documentation with the code currently shipped.
   - Record which 015 acceptance criteria are automated, live-smoke gated, manual, or not yet met.
   - Remove statements that the HTTP entrypoint, Octokit adapter, or real Git runner remain unwired.
   - Document all four required runtime variables, including `AKER_BUILD_INSTALLATION_ID`.

2. **GitHub App permission correction**
   - The documented minimum permission set becomes `metadata: read`, `contents: read`,
     `pull_requests: read`, and `checks: write`.
   - Webhook subscription remains limited to `pull_request`.
   - Installation instructions and live-smoke diagnostics use the same canonical permission set.

3. **Continuous integration baseline**
   - Every pull request runs the complete workspace test suite, workspace typecheck, benchmark
     regression gate, and first-run smoke test.
   - CI covers Ubuntu, Windows, and macOS where platform-specific Git/filesystem behavior matters.
   - A minimum-supported Node job pins Node `22.13.x`; the primary job uses Node 24, the current
     LTS line as of 2026-07-17. Node 22 remains covered as the package's minimum/maintenance line.
   - Existing report-only dogfood behavior remains advisory.

4. **Test-environment isolation**
   - Every test-created Git repository configures its own user identity and disables commit signing
     locally before its first commit.
   - Tests do not depend on global Git ignore, credential helper, signing, hooks, or SSH-agent state.

5. **Supply-chain baseline**
   - GitHub Actions are pinned to immutable commit SHAs with the human-readable release in comments.
   - Dependabot tracks npm and GitHub Actions dependencies.
   - CodeQL analyzes TypeScript/JavaScript.
   - A scheduled production-dependency audit reports failures without attempting an automatic fix.

### Acceptance gates

- [ ] All shipped 014/015 tasks have evidence-linked completion status; incomplete items remain unchecked
      with a concrete reason.
- [ ] No documentation contradicts whether the App host and adapters are implemented.
- [ ] A clean operator walkthrough names every required environment variable and permission.
- [ ] `pnpm test` passes without changing the machine's global Git configuration.
- [ ] `pnpm typecheck`, benchmark, and first-run smoke pass in CI.
- [ ] Platform jobs exercise Linux, Windows, and macOS.
- [ ] Production dependency audit is green at merge time.

### Out of scope

No runtime queue, new review semantics, detector packs, npm publishing, Action product package,
or MCP code is added in 016.

## 017 — GitHub App Runtime Fortification

### Goal

Make the self-hosted single-tenant GitHub App reliable and bounded under real webhook traffic while
remaining stateless, report-only, and secret-safe.

### Architecture

The HTTP layer becomes an intake boundary rather than the job executor:

```text
HTTP request
  -> body-size bound
  -> HMAC verification
  -> X-GitHub-Event/action/schema validation
  -> installation + delivery validation
  -> reserve bounded queue capacity
  -> create/update an `in_progress` Aker Build check
  -> bounded in-memory queue
  -> 202 response

child-process worker
  -> metadata read
  -> ephemeral base/head checkout as required
  -> bounded scan/review
  -> update the existing Aker Build check with the final result
  -> guaranteed workspace disposal
```

The queue is process-local and non-durable to preserve the approved stateless model. GitHub Checks
provides the durable visibility marker: no delivery is acknowledged until an `in_progress` check exists.
A bounded in-memory delivery cache prevents duplicate work within a process lifetime. A process crash
may leave the check in progress, but never falsely successful or silently accepted; operator-visible
stuck-check metrics and GitHub redelivery recover it, and redelivery must update the same check.

Scanning and Git are synchronous today, so workers run in child processes rather than callbacks on the
HTTP event loop. The intake process performs only bounded parsing, validation, queue admission, and the
initial Checks call. Worker IPC carries validated repository/PR/SHA identifiers and fixed outcome codes—
never credentials, raw webhook bodies, source contents, or arbitrary exception messages.

### Runtime limits

Defaults are explicit and configurable within validated safe ranges:

- Webhook body: 5 MiB maximum.
- Webhook acknowledgement target: under 8 seconds after receiving the full body, with the initial
  Checks call limited to 5 seconds so the service remains below GitHub's delivery deadline.
- Worker concurrency: 2.
- Waiting queue: 32 deliveries; overflow returns `503` so GitHub can redeliver.
- Whole delivery deadline: 120 seconds.
- Individual Git subprocess deadline: 60 seconds.
- Files considered per scan: 50,000 maximum.
- Individual readable file: 2 MiB maximum.
- Aggregate bytes read per scan: 250 MiB maximum.
- Stale workspace age: 15 minutes.

When a trusted event exceeds a scan or processing budget, the check concludes `neutral` with a fixed
reason code. It never concludes `success` from partial analysis.

017 introduces a reusable scanner `ScanBudget`/`ScanUsage` boundary and a fixed
`ScanBudgetExceededError`. Existing CLI behavior remains backward compatible by using an explicit
unbounded budget until 019/020 expose user-facing policy. The App supplies the bounded defaults above.
019 later serializes the same usage data into its coverage-honesty contract; it does not invent a
second budgeting implementation.

### Security and isolation

- Require `X-GitHub-Event: pull_request`; other event types are acknowledged without processing.
- Require a syntactically valid `X-GitHub-Delivery`; deduplicate it in a bounded TTL cache.
- Require payload `installation.id` to equal the configured single-tenant installation ID.
- Validate owner and repository names before constructing a remote URL.
- Do not place an installation token in a child-process command line. Pass Git authentication through
  a narrowly scoped child-process environment or another mechanism that cannot persist in `.git/config`.
- Track every workspace created by the workspace implementation. `dispose()` only removes a tracked,
  resolved directory contained beneath the configured temporary root.
- Each workspace contains a fixed-name ownership marker with only a format version, creation time,
  and random cleanup nonce—never credentials or source content. On startup and graceful shutdown,
  remove only stale, prefix-matching directories whose marker validates and whose resolved path is
  contained beneath the configured temporary root.
- Public incomplete-review messages come from a closed `IncompleteReason` enum; arbitrary exception
  messages never reach a Checks payload or HTTP response.

### Reliability and observability

- Retry transient GitHub reads/writes a maximum of three attempts with bounded exponential backoff
  and jitter; never retry authentication, authorization, schema, or signature failures.
- Add `/healthz` for process liveness and `/readyz` for queue/worker readiness.
- Set request, headers, keep-alive, and socket timeouts explicitly. The production guide requires TLS
  termination in front of the Node HTTP listener; binding beyond loopback is an explicit configuration.
- Graceful shutdown stops intake, drains active work up to the delivery deadline, disposes workspaces,
  then exits.
- Structured logs use allowlisted fields only: delivery ID hash, repository identity, PR number,
  outcome code, duration, and counts. No source text, token, signature, private key, raw body, command
  line, or raw exception is logged.
- Metrics cover intake count, queue depth, processing duration, neutral/failure/success outcomes,
  timeout count, budget-exhaustion count, GitHub retry count, and workspace cleanup failures.

### Deployment artifact

017 produces a compiled, self-hostable container for the App server. It runs as a non-root user,
uses a read-only root filesystem with a dedicated temporary volume, exposes only the configured HTTP
port, and includes a container health check. Image publication remains a maintainer-triggered action;
the spec does not authorize pushing an image without explicit release credentials and approval.

### Acceptance gates

- [ ] A valid webhook receives `202` before repository checkout or scanning begins.
- [ ] No accepted delivery lacks an operator-visible `in_progress` check at acknowledgement time.
- [ ] Long scans in child workers do not block intake health checks or unrelated webhook responses.
- [ ] Duplicate delivery IDs cause at most one queued job per process lifetime.
- [ ] A process restart/redelivery updates the existing check instead of creating a duplicate.
- [ ] Wrong event type, wrong installation, invalid schema, and invalid signature cause no checkout.
- [ ] Queue overflow, timeout, or scan-budget exhaustion never produces false success.
- [ ] Concurrent jobs use distinct workspaces and respect the configured concurrency bound.
- [ ] Cleanup cannot remove an untracked or out-of-root path.
- [ ] No credential appears in argv, logs, errors, payloads, files, or metrics.
- [ ] Health, readiness, retry, shutdown, and stale-cleanup paths have automated tests.
- [ ] A live full-host smoke test proves signed webhook -> checkout -> review -> check -> cleanup.

## 018 — Diff-Aware PR Review

### Goal

Make PR verdicts describe what the change introduced, instead of attributing every finding in a
changed file to the PR.

### Architecture

The review engine gains an explicit comparison input:

```text
base source -> scan -> gates -> base findings
head source -> scan -> gates -> head findings
base..head diff -> changed files + changed line ranges

base/head findings + line ranges
  -> classify new / existing / resolved
  -> decide verdict from new findings + scope violations
  -> render changed-line annotations and debt summary
```

Local mode resolves the base from an explicit `--base <ref>` or the current branch's merge base with
`HEAD`; working-tree and staged changes compare against `HEAD`. It materializes committed base source
into an owned OS-temporary snapshot using a read-only Git archive flow; it never checks out another ref,
moves HEAD, resets the index, or adds worktree metadata to the user's repository. PR mode materializes
base and head inside the App-owned temporary workspace using webhook/API-provided SHAs. Untracked local
files treat all lines as added.

### Finding identity and classification

- Preserve the existing status-bearing `findingId` for suppression compatibility. Add a comparison-only
  `findingFingerprint` made from gate ID, evidence path, signal, and a SHA-256 digest of bounded normalized
  source context surrounding the evidence line. The digest is computed transiently and exposes no source
  text. Status, line number, severity, confidence tier, and suppression are comparison attributes rather
  than fingerprint fields, so line movement does not create a false new finding and status changes can
  be classified explicitly.
- Compare findings as multisets, not sets. Pair identical fingerprints first; for repeated identical
  risky statements, pair remaining base/head instances by nearest relative order. Unpaired head instances
  are new and unpaired base instances are resolved. This prevents two same-signal findings in one file
  from collapsing into one result.
- `new`: present at head and absent at base.
- `existing`: present at both base and head.
- `resolved`: present at base and absent at head.
- `changed`: same stable identity but materially different severity, confidence tier, suppression,
  or evidence status. A worsening classification contributes to the verdict; an improvement does not.
- `unattributed`: head finding has no path/line relationship to the diff. It is reported as debt or
  needs verification but does not silently become a PR-introduced failure.

### Verdict rules

- New or worsened confirmed risk -> `not_ready`.
- New or worsened suspected/needs-verification finding -> `needs_verification` unless a confirmed risk
  already makes the verdict `not_ready`.
- Existing findings do not block an otherwise clean PR; they remain visible in a separate debt section.
- Resolved findings are reported positively and never block.
- Scope violations retain their existing behavior and can still make a review not ready.
- If base source, head source, or the diff is incomplete, the result is `needs_verification`, never ready.

### Output contracts

`review.json` receives a schema-version increment because each finding gains classification and the
report gains comparison metadata. The Markdown and Checks renderers show:

- verdict and compared SHAs/refs;
- new/worsened findings first;
- existing findings collapsed into debt summary;
- resolved findings summary;
- annotation only when the evidence line intersects an added/modified line range;
- path-level advisory when a finding is new but cannot be pinned to a changed line.

Existing v1 readers receive a documented migration path. The report command is updated in the same
slice so no in-repo consumer reads a contract it cannot validate.

### Acceptance gates

- [ ] Editing an unrelated line in a file with an old finding does not classify that finding as new.
- [ ] A finding introduced on an added line is new and receives an inline annotation.
- [ ] Moving unchanged risky code within a file remains existing.
- [ ] Adding a second identical risky statement in the same file produces one new instance rather than
      collapsing into the existing instance.
- [ ] Removing a finding classifies it as resolved.
- [ ] Worsening confidence/severity is visible and affects the verdict according to the rules above.
- [ ] Base/head or diff incompleteness yields needs verification.
- [ ] CLI local mode, CLI PR mode, Action mode, and App mode produce the same classification set for
      the same base/head pair.
- [ ] v1 fixture compatibility and v2 consumer migration are explicitly tested.

## 019 — Detection Coverage & Benchmark Hardening

### Goal

Replace silent non-coverage and tiny-sample quality claims with explicit framework coverage and
statistically honest evaluation gates.

### Coverage model

The Project Map gains an optional additive `coverage` object containing:

```text
matched_packs[]        exact detector-pack IDs and versions used
supported_surfaces[]  routes, auth, data access, migrations, config, secrets
partial_surfaces[]    surface + fixed reason code
unsupported_signals[] detected stack/framework with no applicable pack
budgets               files/bytes examined and whether a limit was reached
```

Reports render one of three top-level states: `covered`, `partially_covered`, or
`unsupported_for_risk_claims`. A clean finding list is never presented as clean without its coverage
state. Budget exhaustion forces partial coverage.

### Framework signature packs

Packs are small declarative signature tables consumed by existing detectors; they do not judge and
do not become a plugin execution system. Initial packs:

- Express + common Node DB handles (formalize current behavior).
- Next.js route handlers and middleware.
- NestJS controllers, guards, and common ORM call sites.
- Fastify routes and hooks.
- Prisma query/scoping patterns.
- Django routes, decorators/middleware, and ORM filters.
- SQLAlchemy query/scoping patterns.
- Selected Go `net/http`/router and SQL handle patterns.

Every emitted signal records its pack ID. Unknown frameworks are reported, not guessed.

### Benchmark rules

- Configured thresholds require data. A `null` metric breaches a configured precision or recall floor.
- Each threshold may declare `min_positive_samples` and `min_negative_cases`; falling below either
  fails the benchmark gate with `insufficient_sample`.
- Initial floors remain 0.90 precision and 0.85 recall, but only activate when their sample minimums
  are met.
- Every supported gate/tier must have at least five positive examples and five clean/adversarial
  negative cases before its floor can act as a technical regression gate.
- A public README percentage presented as proven requires at least 20 positive examples, 20 negative
  cases, and representation from at least three applicable framework packs. Smaller measured sets are
  labeled `preliminary` and never displayed as generalized proof.
- The scorecard always shows TP, FP, FN, positive sample count, negative case count, pack coverage,
  and a 95% Wilson score interval or an explicit `sample too small` label.
- Corpus cases remain synthetic or derived from permissively licensed public patterns without copying
  project-specific business logic.

### Acceptance gates

- [ ] A configured threshold with no measured data fails.
- [ ] A metric below its sample minimum cannot display a marketing percentage.
- [ ] Every initial framework pack has positive, clean, multiline, and misleading-name cases.
- [ ] Unknown frameworks produce an honest unsupported/partial coverage state.
- [ ] Scan-budget exhaustion appears in Project Map, report, review, and Checks output.
- [ ] Existing Project Map v1 fixtures remain valid because the coverage field is additive and optional.
- [ ] Benchmark generation is deterministic and CI-enforced.

## 020 — Distribution & Developer Experience

### Goal

Turn the verified kernel into a professional installable product with a short first-run path.

### Distribution architecture

- Bundle the CLI and its workspace dependencies into a standalone ESM executable artifact under
  `packages/cli/dist/`; users do not install unpublished internal workspace packages.
- The npm package exposes `aker-build` from compiled JavaScript, contains a strict `files` allowlist,
  declares Node `>=22.13`, includes license/readme/schema assets, and starts at `0.1.0`.
- `npm pack` output is installed into a clean temporary project and exercised without the repository,
  TypeScript, tsx, or workspace links.
- Release is maintainer-triggered and uses npm provenance. Preparing the release workflow does not
  authorize an actual publish; registry authentication and publish remain an explicit external action.
- Before package metadata freezes, verify whether the unscoped `aker-build` registry name is available
  to the maintainer. If it is not owned/available, publish `@aker-build/cli` while retaining the
  `aker-build` executable name, exactly as ADR-010 requires. Documentation uses only the selected name
  after that decision—never both as if interchangeable.
- Generate an SBOM and attach checksums to the corresponding GitHub release.

### Shared kernel API

020 adds a focused internal `packages/kernel` orchestration package before implementing `check`. It
composes pure/in-memory entry points from scanner, gates, queue, route, prompt, review, and report while
keeping filesystem serialization in explicit adapters. Existing CLI commands migrate to those same entry
points with golden parity tests. `aker-build check` uses the kernel directly, and 021 later consumes this
stable API instead of shelling out to the CLI or emulating its file pipeline.

The kernel never executes repository code and does not own policy judgment. It sequences the existing
engines, propagates `ScanBudget`/coverage/incompleteness, and returns typed artifacts. Optional writers
persist only the same named `.aker-build` artifacts the CLI already owns.

Artifact writers resolve and validate the output directory before writing, reject symlink escapes and
the repository root as an output directory, and use same-directory temporary files plus atomic rename.
The default remains `<repo>/.aker-build`; a custom in-repository directory requires an explicit
`--allow-in-repo-output` acknowledgement, while an absolute directory outside the repository is allowed.
No writer overwrites an unrelated filename or writes outside its resolved output root.

### Composite Action

The repository exports a report-only composite Action that runs the same compiled CLI pipeline.
It requests read-only contents/pull-request access, writes only job summary/artifacts by default, and
never makes a finding blocking unless a future separately approved P6 policy exists. The repository's
dogfood workflow becomes its first consumer.

### Commands

1. `aker-build init`
   - Shows the exact config path and content before writing.
   - `--dry-run` performs no write.
   - Refuses to overwrite an existing config unless `--force` is explicitly supplied.
   - Writes only the named config file; never edits source, Git configuration, or CI.
   - Its spec records the owner's explicit approval of this named, visible mutation and passes a
     Principle VI constitution check; there is no implicit write during any other command.

2. `aker-build doctor`
   - Read-only checks for Node version, Git availability, repository state, config validity, output
     writability, detected frameworks, coverage status, and optional GitHub CLI/App prerequisites.
   - Emits human text and versioned JSON with fixed diagnostic codes.

3. `aker-build check`
   - Runs scan -> gates -> queue -> route -> report as one deterministic command.
   - Supports the existing config/out/format controls.
   - Stops on invalid upstream output and never presents partial work as success.
   - `--local-diff` optionally appends the 018 review step.

### Cross-platform first run

The canonical smoke is implemented as a cross-platform Node integration test/script rather than
duplicated shell logic. CI installs the packed artifact into a clean temp directory on Linux, Windows,
and macOS, runs `doctor`, `check`, and local-diff review, and validates every output schema.

### Acceptance gates

- [ ] `npx aker-build --help` works from a clean machine without tsx or the monorepo.
- [ ] The packed artifact contains only allowlisted files and no source maps containing source text,
      credentials, fixtures, or private paths.
- [ ] `init --dry-run` is non-mutating; normal init writes exactly one declared config file.
- [ ] `doctor --format json` is schema-valid and stable.
- [ ] `check` produces the same artifacts as the equivalent individual command sequence.
- [ ] Output writers reject repository-root, path-escape, and symlink-redirection attempts and leave no
      partial artifact after an interrupted write.
- [ ] The composite Action dogfoods the packed CLI and remains report-only.
- [ ] Linux, Windows, and macOS clean-install smoke passes.
- [ ] Release workflow produces provenance, SBOM, checksums, and release notes without printing secrets.

## 021 — Agent-Native MCP Surface

### Goal

Let coding agents consume Aker Build's control plane directly without allowing Aker Build to execute
agents or mutate repositories.

### Architecture

Create `packages/mcp-server` as a local stdio-only MCP server over the public kernel API stabilized
in 020.
It is bundled into the public `aker-build` npm package and starts through `aker-build mcp`, so users
do not install or version a second public package. The first release has no HTTP transport, hosted
service, database, authentication system, or remote repository access.

The server exposes three tools:

1. `aker_next_task`
   - Input: absolute repository path and optional config path.
   - Runs the in-memory scan/gates/queue/route pipeline under the same budgets and returns the routed
     item, evidence paths, coverage state, and stop conditions.

2. `aker_compile_prompt`
   - Input: repository path, queue item ID, and target agent (`claude`, `codex`, or `generic`).
   - Returns the existing safe compiled prompt. It never invokes the target agent.

3. `aker_review_diff`
   - Input: repository path, optional queue item ID, and optional base ref.
   - Returns the 018 diff-aware review report without writing a GitHub check.

### Safety boundary

- Stdio transport only; the MCP process can access only paths explicitly supplied by the client.
- Resolve and validate the repository root before reading. Reject non-Git paths and path escapes.
- Results contain repository-relative evidence paths and never echo the absolute repository path.
- Default execution is in memory. The server writes no artifacts unless a future explicitly approved
  option names an output directory.
- Never return raw source contents, secret-like values, webhook credentials, environment values, or
  arbitrary command stderr.
- Repository-derived titles/signals are treated as untrusted data and delimited in prompt context.
- Tool results include the exact commands the consuming agent may run, but the MCP server does not run
  those commands beyond Aker Build's own read-only analysis primitives.
- No tool exposes commit, write-file, apply-patch, push, merge, issue, label, comment, or agent-execution
  capability.

### API structure

- Zod validates every tool input and result.
- Tool failures use fixed codes: invalid input, unsupported coverage, incomplete analysis, no safe task,
  and internal failure.
- Internal exceptions are logged only as redacted structured diagnostics and never copied to results.
- Public library functions are extracted only where required to avoid shelling out to the CLI or
  parsing human output.

### Acceptance gates

- [ ] MCP results match direct library/CLI results for the same repository state.
- [ ] No tool executes an agent or mutates repository/GitHub state.
- [ ] No source or secret value appears in results, logs, or protocol traces.
- [ ] Malicious repository text cannot add MCP tools, escape prompt delimiters, or change allowed files.
- [ ] Unknown/partial framework coverage remains visible to the consuming agent.
- [ ] `npx aker-build mcp` starts and serves all tools over stdio from the packed CLI distribution.
- [ ] Contract tests run against Claude/Codex-neutral MCP protocol fixtures without requiring either
      vendor's credentials.

## Cross-spec dependency map

| Slice | Depends on | Contract it stabilizes for later slices |
|---|---|---|
| 016 | 015 shipped state | Truthful docs, green CI, reproducible tests |
| 017 | 016 | Safe App host and bounded scan execution |
| 018 | 017 | Diff-aware review v2 consumed by App/Action/MCP |
| 019 | 018 | Coverage-aware Project Map/reports and honest benchmark claims |
| 020 | 019 | Packed CLI, Action, onboarding, stable public distribution |
| 021 | 020 | Stdio MCP adapter over stable public library contracts |

018 and 019 may be designed in parallel after 017, but implementation remains sequential unless their
approved plans prove disjoint write scopes. 020 must consume the final contracts from both. 021 is last
so it does not freeze immature internal APIs.

## Verification strategy

Every slice uses test-first implementation and must pass:

```text
focused package tests
workspace test suite
workspace typecheck
benchmark regression gate where detector/review behavior is involved
cross-platform smoke where Git/filesystem/package behavior is involved
secret-sentinel tests where credentials, logs, prompts, or protocol output are involved
git status verification showing only the approved slice files
```

Live GitHub verification is required for 017 and release-registry verification is required for the
final 020 release. Those external actions require operator credentials and explicit execution approval;
the implementation plans must keep them as named release gates rather than silently simulating success.

## Program completion criteria

The program is complete only when:

1. Repository docs/specs/tasks match the shipped product and CI continuously verifies them.
2. The App safely acknowledges and processes real webhooks under bounded resources.
3. PR reviews distinguish introduced, existing, worsened, and resolved findings.
4. Every clean claim carries explicit coverage and statistically adequate benchmark evidence.
5. A user can install `aker-build@0.1.0`, run `doctor` and `check`, and use the report-only Action
   without cloning this monorepo.
6. A local agent can request the next safe task, compile its prompt, and review its diff through MCP
   without Aker Build executing the agent or mutating the repository.
7. P5 and P6 remain absent unless separately proposed and owner-approved after this program.

## Explicitly deferred

- Hosted multi-repository organization dashboard or report storage.
- Merge-blocking enforcement, branch-protection management, or non-overridable policy.
- Automatic fixes, commits, pushes, pull requests, merges, or issue creation.
- Direct AI-agent execution or orchestration.
- Public multi-tenant GitHub App hosting.
- Arbitrary executable detector plugins, OPA/Rego, or a full AST/static-analysis platform.
- Paid plans, billing, or usage metering.

## External architecture and security review record

Review date: 2026-07-17
Review stance: skeptical external reviewer, delegated by the owner; requirements, constitution,
architecture, security, failure behavior, testing, compatibility, and production readiness checked
without assuming the author's choices were correct.

### Material findings resolved during review

1. **Blocking intake despite an async-looking queue (critical).** Scanner and Git operations are
   synchronous, so callbacks in the HTTP process would still block intake. The design now requires an
   isolated child-process worker pool and bounded IPC.
2. **Accepted delivery could disappear silently on process crash (critical).** A non-durable queue is
   required by the approved stateless boundary. The design now reserves queue capacity and creates an
   idempotent `in_progress` GitHub check before acknowledging; a crash is visible and recoverable by
   redelivery, never a false or silent success.
3. **Finding comparison could collapse duplicates (critical).** Gate/path/signal alone cannot distinguish
   two identical risky statements in one file. The design now uses context-digest fingerprints plus
   multiset and relative-order matching.
4. **MCP had no viable in-memory engine seam (important).** Existing packages compose through files.
   020 now creates a focused typed kernel API and migrates CLI orchestration to it before 021 consumes it.
5. **Local base analysis risked mutating Git state (important).** The design now uses an owned temporary
   Git archive snapshot and explicitly forbids checkout/reset/worktree metadata in the user's repo.
6. **Runtime budgets were sequenced after the runtime that needs them (important).** 017 now owns shared
   `ScanBudget`/`ScanUsage` primitives; 019 serializes them into coverage instead of duplicating them.
7. **Small samples could still be marketed as proof (important).** Technical gates require minimum
   samples; public proof requires 20 positive and 20 negative cases across at least three packs with
   95% Wilson intervals.
8. **Distribution and visible mutation decisions were underspecified (important).** 020 now resolves the
   npm name per ADR-010, records explicit Principle VI approval for `init`, and defines containment-safe
   atomic output writing.

### Accepted residual constraints

- The default App queue remains non-durable to preserve the constitution's stateless P4 boundary.
  A crash can require GitHub redelivery, but the durable `in_progress` check makes the condition visible.
- Live GitHub smoke and final npm/image publication require operator-controlled external credentials and
  remain explicit execution gates; automated tests cannot claim they occurred.
- Signature packs remain bounded pattern recognizers, not a full parser. Coverage output must disclose
  this limitation on every clean claim.
- P5/P6 remain unapproved regardless of completion of this program.

### Verdict

No critical or important design issues remain open. The master program is **approved for creation of
the individual 016-021 specs and implementation plans**, beginning with 016. This is not blanket approval
to merge all slices together or bypass each slice's reviewed spec/plan/tasks gate.

## Next artifact sequence

After this written design is approved:

1. Create and approve `specs/016-source-truth-ci-baseline/{spec,plan,tasks}.md`.
2. Implement and verify 016.
3. Repeat the reviewed spec -> plan -> tasks -> implementation cycle for 017 through 021 in order.
4. Stop after each slice for its evidence-based completion review; do not roll an unapproved next slice
   into the current change.
