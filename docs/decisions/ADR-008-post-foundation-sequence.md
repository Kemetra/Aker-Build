# ADR-008: Post-Foundation Sequence and Release Boundary

- Status: Proposed
- Date: 2026-06-19
- Deciders: TenantGuard maintainers
- Related specs: `001` through `009`, proposed `010-release-readiness-and-first-run-demo`

## Context

TenantGuard has completed the foundation and the initial nine-spec roadmap has moved the product from product foundation into MVP implementation / dogfooding.

Current evidence shows the CLI now wires the core MVP chain:

```text
scan -> map -> gates -> queue -> route -> prompt -> review-pr
```

The remaining risk is not that TenantGuard lacks features. The main risk is public release before the first-run path, output contracts, docs, and distribution story are reliable.

There is also doc drift:

- The blueprint expected `009-spec-kit-adapter` and `010-example-project`.
- Current main uses `009-launch-and-community-strategy`.
- The package CLI README still describes only `scan` and `map` even though more commands exist.

## Decision

After foundation, TenantGuard will prioritize release confidence over new surfaces.

Adopt this sequence:

```text
010 release readiness + first-run demo
011 spec-kit adapter + config boundary
012 output contract + report versioning
013 npm package + release workflow
014 reusable report-only GitHub Action
015 launch readiness execution
```

The next implementation-dispatchable feature is not GitHub App or dashboard. The next safe feature is `010-release-readiness-and-first-run-demo`.

## Rationale

- A working demo is the fastest way to validate user value.
- Output contracts should be stabilized before external users build around reports.
- Configuration and Spec Kit adapter support real-world usage without locking users into Spec Kit.
- npm distribution should come before a public launch.
- The GitHub Action should remain report-only until trust is earned.
- Hosted dashboard and GitHub App increase operational/security scope and are premature.

## Consequences

Positive:

- Reduces launch risk.
- Turns the MVP into something a stranger can try.
- Keeps the product aligned with CLI-first and no-hidden-mutation principles.
- Avoids building expensive hosted surfaces before product pull.

Costs:

- Delays GitHub App/dashboard.
- Requires disciplined doc reconciliation before more feature work.
- May expose weak output contracts that need tightening.

## Non-goals

```text
No hosted dashboard.
No GitHub App.
No auto-fix.
No auto-commit.
No auto-merge.
No paid SaaS/billing.
No Retail Tower / ERPNext / POS-specific rules.
```

## Review checklist

- [ ] Does this ADR match current `main`?
- [ ] Does `010` avoid production code unless tasks explicitly allow it?
- [ ] Does the sequence keep GitHub App/dashboard deferred?
- [ ] Does the sequence unlock the 009 launch plan safely?
