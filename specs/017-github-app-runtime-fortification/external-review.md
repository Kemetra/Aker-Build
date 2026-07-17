# 017 Owner-Delegated External Review

**Reviewer posture**: Independent release/safety review requested by the owner
**Date**: 2026-07-17
**Decision**: Approved for test-first implementation after corrections below

## Blocking findings resolved before approval

1. **IPC contract contradicted the current dispatcher.** The first plan draft said the worker would
   reuse `dispatch`, but `dispatch` requires the raw body and signature. Sending those would violate
   metadata-only IPC. The approved plan extracts `processVerifiedEvent(event, deps)` and retains
   `dispatch` only as a verification/parsing compatibility wrapper.
2. **Ownership marker could collide with source.** A marker at the Git checkout root can conflict
   with a repository file of the same name and make checkout behavior repository-controlled. The
   approved design uses a marked wrapper with a separate `repo/` child.
3. **Worker artifact resolution was underspecified.** The approved plan requires separate bundled
   server/worker entries and source-vs-compiled sibling resolution without job metadata in argv.
4. **Crash neutralization lacked a stable target.** Parent timeout/crash handling now updates the
   known initial check ID rather than relying on a potentially ambiguous re-find.

## Non-blocking constraints retained

- GitHub documents a 2xx response target within ten seconds, delivery GUIDs that remain stable on
  redelivery, and check runs that can start `in_progress` and complete later. The five-second initial
  check budget preserves margin but is a product limit, not a GitHub guarantee.
- GitHub does not automatically redeliver every failed delivery. A `503` keeps overflow unaccepted;
  operator automation/manual redelivery remains part of deployment operations.
- Local tests cannot prove a registered App, public TLS endpoint, or GitHub-hosted redelivery. Those
  remain explicit handoff evidence.

## Rejection checklist result

The corrected artifacts define ordering, capacity reservations, idempotency, secret boundaries,
cleanup containment, retry exclusions, backward-compatible unbounded CLI behavior, non-root artifact
policy, forbidden scope, and honest live-evidence boundaries. No blocking ambiguity remains for the
RED-test phase.

## Implementation diff review

**Decision**: Locally approved after corrections; operator evidence remains explicit.

The implementation review found and resolved four blocking edge defects before approval:

1. Neutral worker results did not carry a closed incomplete reason or child retry count, preventing
   accurate budget/retry metrics. The validated IPC now accepts only fixed reasons and numeric usage.
2. The first ESM bundle built successfully but could not execute a bundled CommonJS YAML dependency.
   A production-artifact test reproduced the dynamic-require failure; the build now supplies Node's
   `createRequire`, and both compiled worker and server health smokes pass.
3. Graceful shutdown left the losing deadline timer referenced when an idle queue drained first.
   The drain helper now clears the timer in all outcomes, pinned by a fake-timer regression.
4. A synchronous child-process spawn failure escaped before crash neutralization. It now updates the
   known check with the fixed `worker_crashed` reason and returns only fixed zero usage/retry data.

The final rejection checklist found no path to `202` before visible check establishment or worker
activation before response completion; no capacity/concurrency overrun; no credential in argv, IPC,
URL, Git config, marker, log, metric, payload, or public exception; no uncontained cleanup; no false
success from incomplete work; no unsafe retry/create loop; no accidental CLI budget; no mutation,
P5/P6, 018+, image publication, or unrelated lockfile drift. Docker execution and registered-App
public-host behavior were not locally available and are not approved by inference.
