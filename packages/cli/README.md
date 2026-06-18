# @tenantguard/cli

The `tenantguard` command-line interface (Commander). MVP commands: `scan` and `map`.

Spec: [`specs/003-cli-scanner`](../../specs/003-cli-scanner/spec.md) ·
Contract: [`contracts/cli-commands.md`](../../specs/003-cli-scanner/contracts/cli-commands.md)

## Commands

```bash
# Scan a repo (read-only) and write .tenantguard/project-map.json
tenantguard scan [path] [--out <dir>] [--stdout] [--format json|yaml]

# Show / re-emit the produced map
tenantguard map [--out <dir>] [--format json|yaml]
```

## Exit codes

- `scan`: `0` map produced & valid · `1` not a Git repo · `2` internal error (assembled map invalid).
- `map`: `0` map shown · `1` no produced map (run `scan` first).

## Guarantees

Inherits the scanner's: read-only on the scanned repo, output validates against
`@tenantguard/project-map`, local-first (no network/credentials), no secrets, domain-neutral.

## Develop

```bash
pnpm test
pnpm typecheck
```
