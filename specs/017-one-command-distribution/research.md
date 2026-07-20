# Research: One-Command Activation and Distribution

**Date**: 2026-07-20

## Evidence

- `packages/cli/package.json` exposes `aker-build` from `src/bin.ts`, so the current package requires a TypeScript loader and is not publish-ready.
- The CLI depends on eight private `@aker-build/*` workspaces. Publishing that source manifest alone would leave consumers with unresolved packages.
- Runtime third-party code used by the CLI graph is limited to Commander, YAML, and Zod; the graph has no native runtime dependency or package-owned runtime asset reads.
- The official npm registry returned HTTP 404 for `https://registry.npmjs.org/aker-build` on 2026-07-20. Availability is not ownership and must be checked again before release.
- ADR-010 selects npm-first distribution, an `aker-build` bin, version `0.1.0`, and maintainer-triggered releases.
- npm's current trusted-publisher documentation requires npm CLI 11.5.1+, Node 22.14+, `id-token: write`, and an existing package before trust can be configured. GitHub-hosted OIDC publication automatically receives provenance for a public package in a public repository.

## Decisions

1. Add `aker-build check [path]` as a thin orchestration command over existing command functions; do not duplicate domain logic or spawn nested CLI processes.
2. Build one ESM executable with esbuild and generate a sanitized release directory. The workspace manifest remains private while the generated manifest has zero dependencies and no lifecycle hooks.
3. Bundle Commander, YAML, and Zod, and ship their license notices with the project license.
4. Verify the exact tarball with `npm pack --json`, clean install, `--help`, and a real example-repository run on Ubuntu and Windows.
5. Keep the first registry publish operator-owned. After bootstrap, use a manually dispatched, environment-protected OIDC workflow; ordinary CI never publishes.

## Rejected Alternatives

- Publishing all internal workspaces: coordinated versions, many registry identities, and a larger release surface without user value.
- Shipping TypeScript plus `tsx`: slow and fragile activation with an unnecessary runtime toolchain.
- Runtime downloader: adds a network/supply-chain boundary after installation and violates the local-first activation goal.
- Including prompt/review in `check`: both require explicit context and would make the one-command path ambiguous.
