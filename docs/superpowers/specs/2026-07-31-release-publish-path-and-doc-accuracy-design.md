# Release Publish Path + Doc Accuracy Design (Spec 024)

**Problem:** Publishing `aker-build@0.1.0` to npm and PyPI surfaced one latent bug in the
release workflow and three false statements in the release documentation.

**Scope:** `.github/workflows/npm-release.yml`, `package.json`, `README.md`,
`CLAUDE.md`, `docs/release/{npm,pypi}.md`, plus a new guard in `scripts/`. No product code.

## The bug

`npm-release.yml` published with an unanchored path:

```yaml
- run: npm publish "release/aker-build-${RELEASE_VERSION}.tgz" --provenance
```

npm parses a bare `a/b` argument as a **GitHub shorthand**, not a file. The observed
failure, hit during the real 0.1.0 publish:

```text
npm error command git --no-replace-objects ls-remote \
  ssh://git@github.com/release/aker-build-0.1.0.tgz.git
npm error git@github.com: Permission denied (publickey).
```

A git authentication error, reported at the last step of a release, for a problem that has
nothing to do with git or authentication. Prefixing `./` resolves it.

This had never fired because the workflow had never authenticated far enough to reach the
publish step — the bug sat behind an earlier one.

## Decision: guard the argument shape, don't just patch the line

A two-character fix that nothing tests will be reintroduced by the next person who edits
that line, and the failure only appears at release time. `scripts/release-publish-path.mjs`
exports:

- `isExplicitLocalPath(argument)` — true only for anchored relative (`./`, `../`, `.\`) or
  absolute (`/…`, `C:\…`) paths.
- `findAmbiguousPublishArgs(root)` — every `npm publish <arg>` in `.github/workflows/*.yml`
  that npm would not read as a file.

Wired into `test:cli-package`, which CI already runs on Ubuntu and Windows.

Flags and `.` are excluded: a flag is not a path, and `npm publish .` legitimately means
the current directory.

### Testing

Written test-first; the repo-wide assertion failed by naming
`.github/workflows/npm-release.yml:44` before the fix.

| Case | Asserts |
|---|---|
| `./x.tgz`, `../x.tgz`, `/tmp/x.tgz`, `.\x.tgz` | recognised as local paths |
| `release/x.tgz`, `release/x-${VAR}.tgz` | recognised as ambiguous — the exact failing form |
| Temp fixture with one bad and one good workflow | finds only the bad one — the hard negative |
| Real repository | no workflow publishes from an unanchored path |

The fixture case is the one that matters: a guard flagging both forms, or neither, would
pass its own suite while proving nothing.

## The false statements

| Where | Claimed | Reality |
|---|---|---|
| `docs/release/npm.md` | first publish is done "interactively with two-factor authentication **and provenance**" | mutually exclusive — `npm publish --provenance` requires a CI environment with OIDC and cannot run from a workstation. 0.1.0 has no provenance. |
| `README.md` status | "Public npm availability is pending the owner-run first publish" | published and verified from the registry |
| `CLAUDE.md` current phase | first npm publish "remains operator-owned"; Spec Kit block names 017 active | shipped on both registries; 018, 020–023 have since landed |

`docs/release/npm.md` also documented the unanchored publish command, so the runbook would
have reproduced the bug by hand.

The `<!-- SPECKIT -->` block in `CLAUDE.md` is left untouched: it is generator-managed, and
the section above it already designates itself authoritative. Editing it would create a
conflict with the tool that owns it.

## The asymmetry worth recording

The two registries need **opposite** bootstrap strategies, and neither runbook said so.
Four failed dispatches were spent learning it.

| | npm | PyPI |
|---|---|---|
| Bind a publisher to a not-yet-existing package? | **no** | **yes** — pending publishers |
| First release | must be manual (token) | can be OIDC from CI |
| Then | attach Trusted Publishing; later releases get provenance | pending entry converts to a project publisher |

Corollaries now recorded in the runbooks:

- A PyPI Trusted Publisher is **per-project**, not per-account. Holding one for another
  project yields `invalid-publisher` — "valid token, but no corresponding publisher" —
  because PyPI looks under *this* project name. That error means edit configuration, not
  credentials.
- npm requires publish-time 2FA or a bypass-capable token. A classic **Publish** token is
  refused with `403`; a classic **Automation** token works; a **Granular** token scoped to
  specific packages cannot create a package that does not exist yet.

## Risks

| Risk | Mitigation |
|---|---|
| The guard's regex misses an exotic publish invocation | It targets the one form used in this repo's two workflows and asserts the whole repo is clean; a novel form would be caught by review, and the guard is cheap to extend. |
| `isExplicitLocalPath` rejects a legitimate bare path | It is deliberately strict: any bare `a/b` *is* ambiguous to npm, so rejecting it is correct even when the author meant a file. |

## Out of scope

npm Trusted Publishing configuration and account 2FA — account settings, not code.
Recorded as pending operator actions in `docs/release/npm.md`.
